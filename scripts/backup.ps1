<#
.SYNOPSIS
  Backs up the hosted Supabase Postgres database (project ulgsndzfksphquqakelq)
  to a timestamped, compressed local archive.

.DESCRIPTION
  Dumps schema, data, and cluster roles from the linked Supabase project.

  Schema dump excludes Supabase's own internal schemas (auth/storage/cron/
  vault/realtime/etc. table and function definitions) - those are managed
  and separately backed up by the Supabase platform itself.

  Data dump does NOT have the same exclusion: confirmed by restore testing,
  `supabase db dump --data-only` includes row data from `auth` (users,
  identities, sessions, refresh_tokens - i.e. password hashes and live
  session/refresh tokens) and `storage` (bucket/object metadata), not just
  `public`. This means backup.zip contains sensitive credential material,
  not only business data - handle/store it accordingly (it is already
  excluded from git via .gitignore).

  Requires: Supabase CLI, already linked to the project (`supabase link`) and
  logged in (`supabase login`). No database password is read, stored, or
  prompted for by this script - the CLI handles authentication itself.

.PARAMETER OutputRoot
  Root folder backups are written under. Defaults to <repo>/backups.

.EXAMPLE
  ./scripts/backup.ps1
#>

[CmdletBinding()]
param(
    [string]$OutputRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) "backups")
)

$ErrorActionPreference = "Stop"

function Write-Status($Message, $Color = "Gray") {
    Write-Host $Message -ForegroundColor $Color
}

$timestamp   = Get-Date -Format "yyyy-MM-dd_HH-mm"
$backupDir   = Join-Path $OutputRoot $timestamp
$schemaFile  = Join-Path $backupDir "schema.sql"
$dataFile    = Join-Path $backupDir "data.sql"
$rolesFile   = Join-Path $backupDir "roles.sql"
$zipFile     = Join-Path $backupDir "backup.zip"
$manifestFile = Join-Path $backupDir "manifest.json"

Write-Status "=== Pilot Database Backup ===" "Cyan"
Write-Status "Target folder: $backupDir"

try {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

    Write-Status "`n[1/3] Dumping schema..." "Yellow"
    supabase db dump --linked -f $schemaFile
    if ($LASTEXITCODE -ne 0) { throw "supabase db dump (schema) failed with exit code $LASTEXITCODE" }

    Write-Status "[2/3] Dumping data..." "Yellow"
    supabase db dump --linked --data-only -f $dataFile
    if ($LASTEXITCODE -ne 0) { throw "supabase db dump (data) failed with exit code $LASTEXITCODE" }

    Write-Status "[3/3] Dumping cluster roles..." "Yellow"
    supabase db dump --linked --role-only -f $rolesFile
    if ($LASTEXITCODE -ne 0) { throw "supabase db dump (roles) failed with exit code $LASTEXITCODE" }

    # Validate each dump actually produced non-empty, real content
    foreach ($f in @($schemaFile, $dataFile, $rolesFile)) {
        if (-not (Test-Path $f)) { throw "Expected dump file was not created: $f" }
        $size = (Get-Item $f).Length
        if ($size -eq 0) { throw "Dump file is empty (0 bytes): $f" }
    }

    $schemaBytes = (Get-Item $schemaFile).Length
    $dataBytes   = (Get-Item $dataFile).Length
    $rolesBytes  = (Get-Item $rolesFile).Length

    # Manifest (written before compression, included in the archive)
    $manifest = @{
        timestamp       = $timestamp
        project_ref     = "ulgsndzfksphquqakelq"
        created_at_utc  = (Get-Date).ToUniversalTime().ToString("o")
        files           = @{
            "schema.sql" = $schemaBytes
            "data.sql"   = $dataBytes
            "roles.sql"  = $rolesBytes
        }
        scope_note      = "schema.sql: public + custom schemas only, platform-managed schemas excluded. data.sql: includes auth.* and storage.* row data (password hashes, session/refresh tokens) in addition to public - contains sensitive credential material, not just business data. See script header."
    }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestFile -Encoding utf8

    # Compress
    Write-Status "`nCompressing backup..." "Yellow"
    Compress-Archive -Path $schemaFile, $dataFile, $rolesFile, $manifestFile -DestinationPath $zipFile -CompressionLevel Optimal -Force
    if (-not (Test-Path $zipFile)) { throw "Compressed archive was not created: $zipFile" }
    $zipSize = (Get-Item $zipFile).Length
    if ($zipSize -eq 0) { throw "Compressed archive is empty (0 bytes): $zipFile" }

    # Verify the archive is a valid, readable zip with the expected entries
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zipFile)
    try {
        $entryNames = $archive.Entries | ForEach-Object { $_.Name }
        foreach ($expected in @("schema.sql", "data.sql", "roles.sql", "manifest.json")) {
            if ($entryNames -notcontains $expected) {
                throw "Compressed archive is missing expected entry: $expected"
            }
        }
    } finally {
        $archive.Dispose()
    }

    # Remove the uncompressed originals now that the archive is verified -
    # the archive is the artifact of record; keeping both wastes disk space.
    Remove-Item $schemaFile, $dataFile, $rolesFile, $manifestFile -Force

    Write-Status "`n=== BACKUP SUCCEEDED ===" "Green"
    Write-Status "Location: $zipFile"
    Write-Status ("Size: {0:N1} KB" -f ($zipSize / 1KB))
    Write-Status "Contents: schema.sql, data.sql, roles.sql, manifest.json"
    exit 0
}
catch {
    Write-Status "`n=== BACKUP FAILED ===" "Red"
    Write-Status $_.Exception.Message "Red"
    exit 1
}
