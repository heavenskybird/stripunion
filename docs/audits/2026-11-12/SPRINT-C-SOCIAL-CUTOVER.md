# Sprint C: social cutover evidence and bounded rollout

Scope: Issue #175. Audited source baseline `ab0f9258`; all findings below are
source/offline evidence, not permission to activate sending. This branch changes
no workflow, runtime receipt, historical event, credential or production switch.

## Implemented and verified offline

- `scripts/social-outbox-cutover-audit.mjs` reads existing event files and **all
  40 tracked Buffer snapshots**. It performs no network requests and prints a
  report to stdout; it has no event-write or delivery path.
- The pinned `SOCIAL-UNKNOWN-CLASSIFICATION.json` records all 73 uncertain events:
  28 X events have **no match in a partial archive**, 45 Telegram events have
  **no provider archive**. The archives contain 339 distinct valid Buffer post
  identities. No event has sufficient archived evidence for a candidate match.
  All 73 remain `QUARANTINE_NO_REPLAY`, `retryEligible=false`. Absence from a
  snapshot is never proof of nondelivery, nor authority to retry.
- Candidate matching, when future offline evidence exists, requires exact
  first-party publication URL, provider/channel, valid delivery time and any
  stored provider ID. Duplicate snapshots of one post count once; multiple post
  IDs require review. A candidate is **not** marked delivered by this tool.
- The read-only `cutoverReadiness()` planner separates Telegram readiness from
  Buffer cooldown, requires affirmative single-writer/runtime/durable-budget/
  legacy-drain/unknown-inventory evidence, and surfaces independent Telegram
  provider failures. It never sends, even when every supplied planning flag is
  true. Its `ready` value is a plan assessment, not execution authorization.
- Fixed Telegram channel normalization: the former `/^-?\\d+$/` matched a literal
  backslash instead of digits, converting numeric chat IDs such as `-100…` into
  invalid `@-100…` usernames. Numeric IDs now remain strings unchanged; named
  channels receive exactly one `@`. This fix is tested without provider calls;
  it does not prove the currently configured production channel uses a numeric ID.
- Added actual-worker mock coverage for Telegram failure after possible provider
  acceptance: durable `reconcile_required`, zero second irreversible request,
  X held independently, no replay on the next worker evaluation. Added proof
  that a lost Buffer response still consumes its shared request budget.

Verification: 87 root reliability tests and 15 data-layer tests pass. The test
harness intercepts all provider/GitHub requests with mocks. No live Telegram,
Buffer or X API call was made.

## Existing protection audit

| Surface | Current protection / limitation |
| --- | --- |
| Native workflow | Operator false exits before install, sync, Buffer reconcile, worker and persistence. Its paused state is explicit. |
| Buffer reads and sends | One durable CAS request budget shared by reconciliation, collector and sender. Default 12/day and 30/rolling-30-days; HTTP429 and GraphQL `RATE_LIMIT_EXCEEDED` persist cooldown. Provider `window=30d` holds at least 30 days from denial, respecting longer Retry-After. No paid-upgrade or unbudgeted fallback. |
| Unprovisioned Buffer runtime | Fails closed before a provider request unless the accepted single-writer switch is true. Source health must continue showing failed/stale, never a fresh zero. |
| Telegram | First-party adapter; native worker does not need Buffer evidence for Telegram-only candidates. Failed Buffer reconciliation holds X while Telegram is evaluated independently. Unknown Telegram acceptance is quarantined, not retried. |
| Global daily usage | Durable delivery budget survives failed main persistence and counts ambiguous attempts. X max20/day, minimum45min spacing, scheduled next-day reservations; Telegram max100/day. Existing tests cover cross-midnight spacing and provider/local receipt deduplication. |
| Single writer | Native main/fresh-run authorization plus isolated CAS journal before irreversible calls. A CAS failure or missing runtime blocks sends; stored unknown identity prevents replay. |
| Legacy entrypoints | `editorial-distribution`, `social-distribution`, `telegram-evergreen` require global send=true and single-writer!=true. Historical `telegram-bootstrap` and `editorial-backfill-2026-10-04` additionally require legacy-replay=true. Keep replay false; do not rerun old jobs. |
| Per-channel activation | Current production worker has one global send switch; explicit independent per-channel rollout wiring is **not yet accepted**. Planner flags in this PR do not add that wiring. A Telegram-only trial requires a reviewed follow-up with X forced closed before global activation. |

## Acceptance sequence — do not execute during R1 recovery

1. Keep `SOCIAL_OUTBOX_SEND_ENABLED=false`, all historical replay entrypoints
   disabled, and existing 73 events unchanged. Complete current R1 acceptance
   independently; social debt must not block publication.
2. Re-read current main, active/pending jobs, runtime branch existence and blob
   SHAs. Drain actual social writers. A queued metadata record alone is not a
   proven lock. Record immutable rollback baselines and operator decision.
3. Run the audit against the new checkout. Verify its source hash and all 73
   dispositions. Review archived provider exports/message links through an
   authorized read-only account when available. Identity mismatch, missing
   evidence, ambiguity or partial lookback keeps an event quarantined. Do not
   change a historical record into retryable, pending or synthetic success.
4. Before any activation, obtain a clear disposition for all 73 unknowns and
   explicit operator acceptance of remaining quarantine. Complete a dedicated
   review of per-channel rollout wiring: X must remain disabled independently;
   no Buffer reconciliation/read may be required to permit a Telegram trial.
   This PR does not supply approval or claim that cutover gate has passed.
5. Provision the existing isolated journal branch through its approved procedure;
   verify CAS, daily counters and legacy fencing offline first. Never initialize
   counters from missing/error responses or reset them to free capacity. Record
   provider cooldown evidence and actual remaining allowance; do not assume
   a local 30-day window grants new provider quota.
6. Validate configured Telegram identity/permissions with an explicitly authorized
   read-only account action. Numeric-ID unit tests are not credential acceptance.
   With explicit trial authorization, use one **new**, distinct, quality-accepted
   event under the native writer and durable cap. This document does not execute
   that trial. Persist/verify provider message ID and main/journal state before
   considering a second event. A timeout is unknown, not a signal to resend.
7. Keep X off until Buffer cooldown is independently cleared, request budget is
   accepted and fresh complete reconciliation evidence fits the bounded request
   allowance. A stale snapshot or a failed read cannot authorize an X send.

## Rollback and stop conditions

Set the operator switch false via the authorized operator path; let an in-flight
irreversible call finish, drain the native writer, and verify subsequent runs
show `PAUSED_BY_OPERATOR` with no provider work. Do not cancel halfway through a
provider call and then replay. Preserve isolated journals/counters and all event
files, including accepted-but-unconfirmed attempts. Keep legacy fencing and the
historical replay guard intact; do not restore an old sender by reverting all of
#170. Fix code in a new reviewed branch; never erase provider receipts, counters
or incident history to make a retry available.

Stop on CAS failure, missing state, invalid counters, provider ambiguity, missing
main persistence, a quota denial or mismatched provider identity. Surface the
real per-channel failure; do not mark the entire data layer healthy because
Telegram can operate independently.

## Remaining account-only decisions

No account action is needed for this offline PR. Real provider reconciliation,
Telegram permission acceptance, independent channel cutover and any actual
trial require explicit activation authorization and current account evidence.
Buffer quota is not bypassed or resolved by this repair. This PR can be reviewed
without changing R1 production; no social cutover is ready or performed.
