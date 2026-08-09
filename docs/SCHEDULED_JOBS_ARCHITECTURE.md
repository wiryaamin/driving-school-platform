# Scheduled Jobs Architecture — pg_cron / pg_net / Background Workers

**Document type:** Architecture reference + operational runbook for the Scheduled Jobs configuration domain.
**Status:** Configuration domain COMPLETE and frozen as of 2026-07-21. Do not modify pg_cron, pg_net, cron schedules, wrapper functions, Vault secrets, or Edge Function secrets without a new documented reason.
**Audience:** Any developer who needs to understand, extend, or troubleshoot the background job pipeline (`event-worker`, `communication-worker`).

---

## 1. Configuration Summary

| Item | Value |
|---|---|
| Extensions | `pg_cron` 1.6.4, `pg_net` 0.20.3 — both enabled on the hosted project |
| Cron jobs | `event-worker-tick` (`* * * * *`, every minute), `communication-worker-tick` (`*/2 * * * *`, every 2 minutes) |
| Wrapper functions | `public.invoke_event_worker()`, `public.invoke_communication_worker()` — both `SECURITY DEFINER` |
| Secret | `WORKER_SECRET` — stored as both an Edge Function secret (`supabase secrets set`) and a Supabase Vault secret (`vault.create_secret`); the two must always hold the identical value |
| Target functions | `event-worker` (outbox drain + maintenance tick), `communication-worker` (message dispatch queue) |

Before this work, `pg_cron`/`pg_net` were not enabled on the project at all, and neither worker had ever been invoked in production — `event_outbox` had a growing, entirely-unprocessed backlog since the tenant's creation.

---

## 2. pg_cron Architecture

`pg_cron` is a Postgres extension that runs scheduled SQL statements from inside the database itself, on standard cron syntax. A scheduled job is a row in `cron.job` (`jobid`, `jobname`, `schedule`, `command`, `active`); each execution is logged as a row in `cron.job_run_details` (`status`, `start_time`, `end_time`, `return_message`).

Critically, **a pg_cron job's "success" only reflects that the SQL statement it ran completed without a SQL-level error** — it says nothing about what that statement caused to happen asynchronously afterward. Both jobs here run a single `SELECT public.invoke_*_worker();` call, and that call itself returns almost immediately (see §4) — so `cron.job_run_details` will show `succeeded` in well under 100ms even when the actual worker invocation it triggered takes 4–17 seconds. **Do not use `cron.job_run_details` to judge whether a worker run actually completed successfully — use `worker_run_log` (§9).**

Registered jobs, as of this domain's completion:

```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
--  1 | event-worker-tick         | * * * * *   | t
--  2 | communication-worker-tick | */2 * * * * | t
```

---

## 3. pg_net Architecture

`pg_net` is a Postgres extension exposing asynchronous HTTP requests as SQL functions. `net.http_post(url, body, params, headers, timeout_milliseconds)` **is fire-and-forget**: it queues the request and returns a `request_id` (bigint) immediately — the calling SQL never blocks waiting for the HTTP response. A background worker (libcurl-based) performs the actual request independently and writes the outcome into `net._http_response` (`id`, `status_code`, `content`, `timed_out`, `error_msg`, `created`) once it finishes or gives up.

**`timeout_milliseconds` controls how long pg_net's own background worker waits for a response, not how long the target server is allowed to take.** The actual installed default on this project, verified directly against `pg_get_function_arguments()` (not assumed from the pg_net README, which is stale on this exact point — it currently states a default of `1000`): **`5000`** (5 seconds). Neither wrapper function below passes an explicit `timeout_milliseconds`, so both use this 5-second default. See §10 (OBSERVATION-1) for the full implication of this.

---

## 4. Wrapper Functions

Both wrapper functions follow an identical pattern: read `WORKER_SECRET` from Supabase Vault, fire an async POST at the target Edge Function with it as a Bearer token, and warn-and-return if the secret isn't found (never raises, so a missing secret degrades to a skipped tick, not a failed cron job).

```sql
CREATE OR REPLACE FUNCTION public.invoke_event_worker()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'WORKER_SECRET' LIMIT 1;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING '[event-cron] WORKER_SECRET not found in vault - tick skipped.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://ulgsndzfksphquqakelq.supabase.co/functions/v1/event-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body    := '{}'::jsonb
  );
END;
$function$;
```

`public.invoke_communication_worker()` is identical except for the target URL (`/functions/v1/communication-worker`) and predates this work (it shipped in migration `20260620000006_comm_worker_cron.sql`, but was never actually scheduled until now). `invoke_event_worker()` is new, added directly against the live project during this domain's Configure step (not yet captured in a migration file — see §11, Lessons Learned).

Both are `SECURITY DEFINER` with `search_path` pinned, `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role`, so only pg_cron's execution context (which runs as the database owner) and explicit service-role callers can invoke them.

---

## 5. Vault Secret Usage

`WORKER_SECRET` exists in two places that **must be kept in sync manually**:

1. **Edge Function secret** (`supabase secrets set WORKER_SECRET=...`) — read by `event-worker`/`communication-worker` themselves (`Deno.env.get('WORKER_SECRET')`) to validate the `Authorization: Bearer <token>` header on incoming requests.
2. **Supabase Vault secret** (`vault.create_secret(value, 'WORKER_SECRET')`) — read by the wrapper functions above to construct that same header when pg_cron invokes them.

Supabase secrets are **write-only** — there is no way to retrieve an existing value via the CLI or API. The original `WORKER_SECRET` (set 2026-06-11, per `supabase secrets list`) was unrecoverable, so it was rotated as part of this domain's Configure step: a fresh value was generated (`openssl rand -base64 32`), set as the Edge Function secret, and stored in Vault with the identical value. If this secret ever needs rotating again, **both locations must be updated together** — updating only one will make the cron-triggered path start failing Authorization checks while manual/direct invocations (or vice versa) continue working, which is a confusing failure mode to debug blind.

To verify no duplicate Vault entries exist for this name (a duplicate with no `ORDER BY` in the reader query would make which one gets used non-deterministic):
```sql
SELECT id, name, created_at FROM vault.secrets WHERE name = 'WORKER_SECRET';
-- should return exactly one row
```

---

## 6. Worker Scheduling

| Job | Schedule | Interval | Rationale |
|---|---|---|---|
| `event-worker-tick` | `* * * * *` | every 1 minute | Drains `event_outbox` (up to `EVENT_WORKER_BATCH_SIZE`, default 50, per run) and runs the maintenance tick (reminders, reservation expiry, credit expiry, dunning, digests) |
| `communication-worker-tick` | `*/2 * * * *` | every 2 minutes | Drains the outbound message queue populated by `event-worker`'s `Communication.Requested` events |

Both schedules were taken directly from this project's own prior documentation (`docs/DEPLOY.md` §Part 2 for event-worker; the migration's own header comment for communication-worker) — they were designed and documented well before this domain's work; what was missing was only the actual `cron.schedule()` execution.

---

## 7. Worker Execution Flow

```
pg_cron (every 1 min)
  └─ invoke_event_worker()               [SQL, SECURITY DEFINER]
       ├─ read WORKER_SECRET from Vault
       └─ net.http_post → event-worker   [async, fire-and-forget]
              └─ POST /functions/v1/event-worker
                    ├─ outbox_claim_next()            (FOR UPDATE SKIP LOCKED — concurrency-safe)
                    ├─ dispatch each event → HANDLER_REGISTRY
                    │     ├─ success → outbox_complete()
                    │     └─ failure → outbox_fail()   (backoff: 30s → 60s → 120s → dead_letter)
                    ├─ maintenance tick (reminders, expiry, credits, dunning, digests)
                    └─ complete_worker_run() → worker_run_log   (always awaited directly, independent of pg_net)

pg_cron (every 2 min)
  └─ invoke_communication_worker()        [SQL, SECURITY DEFINER]
       ├─ read WORKER_SECRET from Vault
       └─ net.http_post → communication-worker   [async, fire-and-forget]
              └─ POST /functions/v1/communication-worker
                    ├─ claim scheduled/retry-due messages (FOR UPDATE SKIP LOCKED)
                    ├─ dispatch via the configured comm provider
                    └─ complete_worker_run() → worker_run_log
```

The key architectural point: **the pg_cron → pg_net leg and the actual worker execution are decoupled.** Once `net.http_post` fires, the Edge Function runs independently of whatever pg_net does or doesn't do afterward (§10).

---

## 8. Validation Results

Live validation performed directly against the hosted project (`ulgsndzfksphquqakelq`), no dry runs:

| Check | Before | After |
|---|---|---|
| `event_outbox` pending | 2,340 | 749 (continuing to drain at time of writing) |
| `event_outbox` delivered | 0 | 1,602 |
| `event_outbox` dead_letter | 0 | 30 (all from the ISSUE-2 defect window — see §9; zero growth since the fix) |
| `notifications` created | 0 | 12 |
| Direct `event-worker` invocation | `HTTP 500` | `HTTP 200`, real batch metrics |
| Direct `communication-worker` invocation | `HTTP 500` / timeout | `HTTP 200`, `{"message":"Queue empty"}` |
| `cron.job_run_details` | n/a (not scheduled) | Both jobs firing on schedule, `status: succeeded` every run |

---

## 9. ISSUE-2 — Root Cause and Repository-Wide Fix

**Symptom:** the very first real invocations of `event-worker` and `communication-worker` (this domain's Configure/Validate step was their first-ever execution — the backlog above had been accumulating, untouched, since tenant creation) returned `HTTP 500` on every call.

**Root cause:** `@supabase/supabase-js@2`'s `PostgrestBuilder` — the object returned by `.rpc()`, `.from().update()`, `.eq()`, and every other query-builder method — implements `.then()` (satisfying the thenable/`await` contract) but does **not** implement `.catch()` or `.finally()` as its own methods; those are native-`Promise`-only. Code that chains `.catch(handler)` directly onto a builder, without first `await`ing it or converting it to a real Promise, throws `TypeError: ...catch is not a function` — unconditionally, for any supabase-js v2 version. This is not a regression from a version bump; it never worked, and had simply never been exercised until this domain's validation ran these functions for the first time.

**Fix:** `.catch(fn)` → `.then(undefined, fn)` at every occurrence. `Promise.prototype.then(onFulfilled, onRejected)` is spec-equivalent to `.catch(onRejected)` for real Promises, and `.then()` is the one method the builder actually implements — so this is a same-call-site method-name swap, not a restructure.

**Every occurrence found repository-wide** (verified via multiple systematic greps across all 65+ Edge Functions, not just the two workers):

| File | Line(s) | Call |
|---|---|---|
| `event-worker/index.ts` | 397, 515, 596, 660, 767, 946, 1241 | `insert_outbox_event` (7 event handlers) |
| `event-worker/index.ts` | 413 | `record_lesson_booked_event` |
| `event-worker/index.ts` | 1084 | `.from('notifications').update().eq()` — not `.rpc()`, same underlying builder bug |
| `event-worker/index.ts` | 1601, 1741 | `complete_worker_run` (failure path and completion path) |
| `bookings/index.ts` | 381 | `record_lesson_completed_event` — **had no surrounding try/catch**, unlike every event-worker occurrence; every "mark lesson completed" request from staff was very likely returning a real `HTTP 500` to the user, despite the underlying status update having already succeeded in the database |
| `orders/index.ts` | 196 | `emit_order_event` |
| `communication-worker/index.ts` | 176 | `complete_worker_run` |
| `public-enrollment/index.ts` | 398, 409 | `increment_coupon_redemptions`, `emit_enrollment_event` |

16 occurrences, 5 files. All fixed in commit `9c02452`, deployed, and validated (§8, §OBSERVATION-1's supporting evidence). No refactoring, no architectural change, no new control flow — every change was the identical one-token swap.

---

## 10. OBSERVATION-1 — pg_net Timeout Behaviour (Known Operational Characteristic)

**Observation:** during validation, `net._http_response` regularly recorded `timed_out = true` entries (`"Timeout of 5000 ms reached..."`) for both workers, while the corresponding Edge Function invocation completed successfully and produced correct results.

**Status: Closed. Expected pg_net behaviour, harmless, no operational impact. Not a defect.**

**Why this happens:** `net.http_post` (§3) only ever waits up to `timeout_milliseconds` (5000ms here, confirmed against the actual installed function signature) for a *response*. The request itself — a few bytes of JSON — is fully sent in milliseconds. What actually exceeds 5 seconds is event-worker's own processing time for a 50-event batch (observed 3.7–17s depending on batch composition). When pg_net's wait window elapses, it stops listening on its side; it cannot and does not un-send the request or signal the server to abort. The Edge Function had already received the full request and continues running to completion regardless of whether the original caller is still listening — confirmed directly by invoking both workers with a plain `curl --max-time 60` and observing identical successful completion in 4–17 seconds.

**Duplicate execution / data inconsistency risk: none.** pg_net has no automatic retry on timeout. The only reason a second invocation ever runs is the next scheduled cron tick, not a reaction to the timeout — and even if two invocations' server-side executions overlap in wall-clock time, `outbox_claim_next()`'s `FOR UPDATE SKIP LOCKED` claiming (and the equivalent on the communication-worker's message queue) makes concurrent, non-overlapping claims safe by construction.

**Verified concretely:** `public.worker_run_log` — written directly by the Edge Function itself via a properly-awaited call at the end of every run, entirely independent of pg_net — shows `run_status = 'completed'` with accurate `processed_count`/`success_count` for every run checked, *including* runs whose `net._http_response` entry shows `timed_out = true`. The only thing actually lost to the pg_net timeout is that one row's `content` field (the HTTP response body echo) — a value nothing in this system reads or depends on.

---

## 11. Known Operational Characteristics

- **`net._http_response.timed_out = true` for event-worker/communication-worker entries is expected and does not indicate failure.** See §10.
- **`cron.job_run_details` reflects only the wrapper SQL function's own execution, not the downstream worker run.** It will show `succeeded` in well under 100ms for both jobs on every tick, because `invoke_*_worker()` never awaits the HTTP call. Use it only to confirm the cron schedule itself is firing, not to judge worker health.
- **`event-worker`'s `events_no_handler` count in its response body is expected to be nonzero and does not indicate a problem** — it reflects outbox event types that don't map to a registered handler in `HANDLER_REGISTRY` (informational events with no downstream action defined), separate from `events_failed`.
- **`invoke_event_worker()` currently exists only on the live database, not yet captured in a migration file** — see §12.

---

## 12. Monitoring Recommendations

- **Use `public.worker_run_log` as the primary/authoritative health signal for both workers**, not `net._http_response`. Query pattern:
  ```sql
  SELECT worker_name, run_status, started_at, duration_ms, processed_count, failed_count
  FROM worker_run_log
  ORDER BY started_at DESC
  LIMIT 20;
  ```
  A useful alert condition: no `worker_run_log` row for a given `worker_name` within the last 2× its expected interval (event-worker: >2 min; communication-worker: >4 min) indicates the pipeline has stalled — a genuinely actionable signal, unlike a `net._http_response` timeout.
- **Do not build alerting on `net._http_response.timed_out`** — per §10, it will fire routinely under normal, healthy operation whenever a batch takes longer than 5 seconds to process, and is not correlated with actual failure.
- **`event_outbox` backlog trend** (`SELECT status, count(*) FROM event_outbox GROUP BY status;`) is a good secondary signal — `pending` should trend toward zero over time (bounded by new event creation), and `dead_letter` should only grow when a genuinely new, distinct failure mode appears (compare `last_error` text against previously-seen values before treating a dead_letter increase as urgent).

---

## 13. Operational Runbook

**Manually trigger a worker run** (e.g. to drain a backlog immediately rather than waiting for the next tick):
```bash
curl -X POST https://ulgsndzfksphquqakelq.supabase.co/functions/v1/event-worker \
  -H "Authorization: Bearer <WORKER_SECRET>" -H "Content-Type: application/json" -d '{}'
```
Same pattern for `/functions/v1/communication-worker`. `<WORKER_SECRET>` is not retrievable from Supabase (write-only) — obtain the current value from wherever it was last recorded outside this repository (per this project's standing rule, secrets are never stored in repo files).

**Check whether the cron jobs are registered and active:**
```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
```

**Check recent worker health** (authoritative — see §12):
```sql
SELECT worker_name, run_status, started_at, duration_ms, processed_count, failed_count
FROM worker_run_log ORDER BY started_at DESC LIMIT 20;
```

**Check outbox backlog:**
```sql
SELECT status, count(*) FROM event_outbox GROUP BY status;
```

**Diagnose a dead_letter spike:**
```sql
SELECT last_error, count(*) FROM event_outbox
WHERE status IN ('failed','dead_letter') GROUP BY last_error ORDER BY count(*) DESC;
```
Group by `last_error` first — a single repeated error string across many rows (as with ISSUE-2's 30 dead_letter rows) points to one shared root cause, not 30 independent problems.

**Rotate `WORKER_SECRET`:**
1. `openssl rand -base64 32`
2. `supabase secrets set WORKER_SECRET="<new-value>" --project-ref ulgsndzfksphquqakelq`
3. `SELECT vault.update_secret(id, '<new-value>') FROM vault.secrets WHERE name = 'WORKER_SECRET';` (or delete + `vault.create_secret` again) — **both steps are required**; doing only one breaks the Authorization check on one side of the cron → worker call.

---

## 14. Lessons Learned

- **A background job that's never been invoked in production is a genuinely different risk category than one that has** — `event_outbox` had a 2,340-event backlog and zero delivery history before this domain's work, meaning the workers' actual business logic had never been exercised end-to-end despite having existed, deployed, for a long time. Enabling the scheduling infrastructure was what finally surfaced ISSUE-2 — a defect that had been latent and invisible the entire time.
- **`client.rpc(...).catch(...)` (and the equivalent on any query builder) is a trap specific to supabase-js's Promise-like-but-not-Promise builder objects** — worth a repo-wide grep as a periodic health check, or a lint rule, since it fails silently in the sense that it *looks* correct and TypeScript doesn't catch it (the builder's types don't model `.catch`/`.finally` as absent in a way that surfaces at the call site clearly).
- **`net._http_response` is not a reliable proxy for "did the downstream work succeed"** when the caller is a fire-and-forget `net.http_post` with a shorter timeout than the target's typical processing time. Any future fire-and-forget integration via pg_net should be documented with the same caveat, and should write its own outcome record (as `worker_run_log` does here) rather than relying on pg_net's response tracking for anything beyond debugging the HTTP leg itself.
- **`invoke_event_worker()` was created directly against the live database during this domain's work and has not yet been captured in a migration file.** This is a deliberate, acknowledged gap, not an oversight: repository-vs-deployed-state divergence is a separate, already-tracked category of technical debt for this project (see the repository-hygiene work referenced elsewhere in this engagement), and this domain's scope was explicitly infrastructure configuration, not repository commits of that infrastructure's definition. A future commit should add a migration mirroring `20260620000006_comm_worker_cron.sql`'s pattern for `invoke_event_worker()`, so a fresh environment provisioning from migrations alone would have it too.
