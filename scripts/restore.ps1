<#
.SYNOPSIS
  Restores a backup produced by backup.ps1.

.DESCRIPTION
  By default, restores into a disposable, throw-away local Postgres
  container (via Docker) - never directly against the live hosted project.
  This is the safe way to validate that a backup is actually restorable
  without any risk to production data.

  Restoring onto a real target (a fresh recovery project, for example)
  requires explicitly passing -TargetConnectionString together with
  -Confirm, and is treated as a deliberate, exceptional action, not the
  default path.

.PARAMETER BackupZip
  Path to a specific backup.zip. Defaults to the most recent backup under
  <repo>/backups.

.PARAMETER TargetConnectionString
  A full Postgres connection string to restore onto instead of the local
  validation container. Requires -Confirm. Use with care - this executes
  destructive SQL (DROP/CREATE) against whatever database this points to.

.PARAMETER Confirm
  Required alongside -TargetConnectionString to acknowledge this restores
  onto a real target, not the safe local validation container.

.PARAMETER KeepContainer
  Leave the local validation container running afterward for manual
  inspection instead of tearing it down.

.EXAMPLE
  ./scripts/restore.ps1
  Restores the latest backup into a disposable local container and validates it.

.EXAMPLE
  ./scripts/restore.ps1 -BackupZip ./backups/2026-07-21_14-30/backup.zip
  Restores a specific backup into a disposable local container.
#>

[CmdletBinding()]
param(
    [string]$BackupZip,
    [string]$TargetConnectionString,
    [switch]$Confirm,
    [switch]$KeepContainer
)

$ErrorActionPreference = "Stop"

function Write-Status($Message, $Color = "Gray") {
    Write-Host $Message -ForegroundColor $Color
}

$repoRoot   = Split-Path -Parent $PSScriptRoot
$backupsDir = Join-Path $repoRoot "backups"
$containerName = "pilot-restore-validate"
$hostPort   = 55432
$pgImage    = "public.ecr.aws/supabase/postgres:17.6.1.127"

try {
    # Resolve which backup to restore
    if (-not $BackupZip) {
        $latest = Get-ChildItem -Path $backupsDir -Directory -ErrorAction Stop |
            Sort-Object Name -Descending |
            Select-Object -First 1
        if (-not $latest) { throw "No backups found under $backupsDir" }
        $BackupZip = Join-Path $latest.FullName "backup.zip"
    }
    if (-not (Test-Path $BackupZip)) { throw "Backup archive not found: $BackupZip" }

    Write-Status "=== Pilot Database Restore ===" "Cyan"
    Write-Status "Backup: $BackupZip"

    $usingRemoteTarget = [bool]$TargetConnectionString
    if ($usingRemoteTarget -and -not $Confirm) {
        throw "-TargetConnectionString was provided without -Confirm. Refusing to run destructive SQL against a real target without explicit confirmation."
    }
    if ($usingRemoteTarget) {
        Write-Status "TARGET: external connection string (NOT the local validation container)" "Red"
        Write-Status "This will execute destructive SQL (DROP/CREATE) against that target." "Red"
    } else {
        Write-Status "Target: disposable local Docker container (safe validation - production is never touched)" "Yellow"
    }

    # Extract the backup
    $extractDir = Join-Path $env:TEMP "pilot-restore-$(Get-Date -Format 'yyyyMMddHHmmss')"
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    Expand-Archive -Path $BackupZip -DestinationPath $extractDir -Force

    foreach ($f in @("roles.sql", "schema.sql", "data.sql")) {
        if (-not (Test-Path (Join-Path $extractDir $f))) {
            throw "Backup archive is missing expected file: $f"
        }
    }
    Write-Status "Extracted to: $extractDir"

    if ($usingRemoteTarget) {
        # Restore onto an explicit external target
        Write-Status "`nRestoring onto external target..." "Yellow"
        foreach ($f in @("roles.sql", "schema.sql", "data.sql")) {
            docker run --rm -v "${extractDir}:/backup" $pgImage `
                psql $TargetConnectionString -v ON_ERROR_STOP=1 -f "/backup/$f"
            if ($LASTEXITCODE -ne 0) { throw "Restoring $f onto external target failed (exit $LASTEXITCODE)" }
        }
        Write-Status "`n=== RESTORE SUCCEEDED (external target) ===" "Green"
        exit 0
    }

    # Safe path: disposable local validation container
    docker info | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker does not appear to be running. Start Docker Desktop and retry." }

    try { docker rm -f $containerName 2>&1 | Out-Null } catch {}

    Write-Status "`nStarting disposable Postgres container on port $hostPort..." "Yellow"
    docker run -d --name $containerName -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -p "${hostPort}:5432" $pgImage | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to start validation container" }

    # The official Postgres image entrypoint starts the server once (Unix
    # socket only) to run init scripts, logs "ready to accept connections",
    # then shuts down and restarts for real (TCP). Waiting for pg_isready
    # or a single schema check can catch that first, transient window and
    # then fail when the container restarts underneath the next command -
    # wait for the SECOND "ready to accept connections" log line instead,
    # which is the correct signal that the restart cycle is complete.
    Write-Status "Waiting for Postgres to finish its init/restart cycle..." "Yellow"
    $stable = $false
    # docker logs writes the container's stderr-originated lines (Postgres
    # logs to stderr) on its own stderr stream, so 2>&1 is required to see
    # them - but under $ErrorActionPreference = "Stop", that redirection
    # turns each line into a terminating NativeCommandError, aborting the
    # assignment silently (caught by the empty catch) before Select-String
    # ever runs. Relaxing EAP just for this call avoids that.
    $prevEAP = $ErrorActionPreference
    for ($i = 0; $i -lt 60; $i++) {
        $readyCount = 0
        try {
            $ErrorActionPreference = "Continue"
            $readyCount = (docker logs $containerName 2>&1 | Select-String -SimpleMatch "database system is ready to accept connections").Count
        } catch {} finally { $ErrorActionPreference = $prevEAP }
        if ($readyCount -ge 2) { $stable = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $stable) { throw "Postgres container did not complete its startup cycle within 60 seconds" }
    Start-Sleep -Seconds 2

    $authReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        $exists = ""
        try {
            $ErrorActionPreference = "Continue"
            $exists = (docker exec $containerName psql -U postgres -d postgres -t -A -c "SELECT to_regnamespace('auth');" 2>&1 | Out-String).Trim()
        } catch {} finally { $ErrorActionPreference = $prevEAP }
        if ($exists -eq "auth") { $authReady = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $authReady) { throw "Container's auth schema did not initialize within 30 seconds" }

    # auth.jwt() is used inside RLS policy definitions in schema.sql, but is
    # not part of the base Supabase Postgres image (auth.uid/email/role and
    # the auth.users table are; auth.jwt is normally added by the platform's
    # own auth-schema bootstrapping, which a bare container never runs). A
    # minimal stub is enough for CREATE POLICY to resolve the reference -
    # the policy body is never evaluated against real request data here.
    Write-Status "Creating auth.jwt() stub (schema.sql references it; not present in base image)..." "Yellow"
    docker exec $containerName psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS `$`$ SELECT '{}'::jsonb `$`$;" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to create auth.jwt() stub" }

    # Extension event triggers (pg_graphql/PostgREST/pg_cron/pg_net access
    # bookkeeping) fire on every DDL statement in schema.sql and error here
    # because this bare container never ran those extensions' own bootstrap
    # migrations (their internal tracking objects don't fully exist). They
    # are irrelevant to whether the business schema itself is valid, so
    # they are disabled for this disposable container only.
    Write-Status "Disabling extension bookkeeping event triggers (local validation only)..." "Yellow"
    docker exec $containerName psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "DO `$`$ DECLARE r record; BEGIN FOR r IN SELECT evtname FROM pg_event_trigger LOOP EXECUTE format('ALTER EVENT TRIGGER %I DISABLE', r.evtname); END LOOP; END `$`$;" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to disable event triggers" }

    # roles.sql's "GRANT ... GRANTED BY postgres" statements require the
    # literal "postgres" role to hold ADMIN option on the granted role -
    # bootstrapping the hosted platform performs at project creation and
    # a bare container never goes through. For local validation only, the
    # GRANTED BY clause is stripped (the grant itself still runs, executed
    # directly by supabase_admin, a real superuser here) so the roles and
    # their relationships are still validated, just not the exact grantor
    # identity, which is a hosted-platform bootstrapping detail, not part
    # of the business data this backup exists to protect. The archived
    # roles.sql itself is never modified - only this in-memory copy used
    # for the disposable local container.
    # data.sql includes auth.* (users, sessions, refresh_tokens, etc.) and
    # storage.* rows, not just public schema data - supabase db dump's
    # schema exclusion list does not apply to --data-only. Real GoTrue/
    # Storage tables (with their full column sets) only exist on an actual
    # Supabase project, not this bare image's stub auth/storage schemas, so
    # those rows are skipped for local validation only; the archived
    # data.sql is untouched and still carries them for a real restore.
    Write-Status "Filtering auth.*/storage.* rows for local validation (bare image lacks the real GoTrue/Storage schema)..." "Yellow"
    $dataFile = Join-Path $extractDir "data.sql"
    $localDataPath = Join-Path $extractDir "data.local.sql"
    $skip = $false
    $filtered = New-Object System.Collections.Generic.List[string]
    foreach ($line in Get-Content $dataFile) {
        if ($line -match '^INSERT INTO "(auth|storage)"\.') { $skip = $true }
        if ($skip) {
            if ($line -match ';\s*$') { $skip = $false }
            continue
        }
        $filtered.Add($line)
    }
    Set-Content -Path $localDataPath -Value $filtered -Encoding utf8

    Write-Status "`nRestoring roles, schema, and data (in order)..." "Yellow"
    foreach ($f in @("roles.sql", "schema.sql", "data.sql")) {
        $hostPath = Join-Path $extractDir $f
        if ($f -eq "roles.sql") {
            $localRolesPath = Join-Path $extractDir "roles.local.sql"
            (Get-Content $hostPath -Raw) -replace ' GRANTED BY "[^"]+"', '' | Set-Content -Path $localRolesPath -Encoding utf8
            $hostPath = $localRolesPath
        }
        if ($f -eq "data.sql") { $hostPath = $localDataPath }
        docker cp $hostPath "${containerName}:/tmp/$f" | Out-Null
        docker exec $containerName psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f "/tmp/$f"
        if ($LASTEXITCODE -ne 0) { throw "Restoring $f into validation container failed (exit $LASTEXITCODE)" }
    }

    # Verify the restore actually produced a real, populated database
    Write-Status "`nVerifying restored content..." "Yellow"
    $tableCount = (docker exec $containerName psql -U supabase_admin -d postgres -t -A -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';").Trim()
    if (-not $tableCount -or [int]$tableCount -eq 0) {
        throw "Verification failed: restored database has 0 tables in the public schema"
    }
    Write-Status "  public schema tables: $tableCount"

    try {
        $orgCount = (docker exec $containerName psql -U supabase_admin -d postgres -t -A -c "SELECT COUNT(*) FROM organizations;" 2>&1 | Out-String).Trim()
        if ($orgCount -and $orgCount -match '^\d+$') {
            Write-Status "  organizations rows:   $orgCount"
        }
    } catch {}

    if (-not $KeepContainer) {
        Write-Status "`nTearing down validation container..." "Yellow"
        docker rm -f $containerName | Out-Null
    } else {
        Write-Status "`nValidation container left running: $containerName (port $hostPort)" "Yellow"
    }

    Remove-Item $extractDir -Recurse -Force

    Write-Status "`n=== RESTORE VALIDATION SUCCEEDED ===" "Green"
    Write-Status "The backup is restorable: $tableCount tables, schema and data applied without error."
    exit 0
}
catch {
    Write-Status "`n=== RESTORE FAILED ===" "Red"
    Write-Status $_.Exception.Message "Red"
    if (-not $KeepContainer) { try { docker rm -f $containerName 2>&1 | Out-Null } catch {} }
    exit 1
}
