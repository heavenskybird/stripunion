# Outbox recovery candidate — #166

This is an isolated repair extracted selectively from Draft #165, then changed
for the confirmed November 11 incident. It does not include the old PR's visual,
keyword or heartbeat work. No production switches or runtime state were changed.

## Confirmed failure

Run 43023930891 stopped at historical Buffer reconciliation with HTTP429,
RATE_LIMIT_EXCEEDED, window=30d. The native worker never ran. The previous
all-or-nothing sequence blocked Telegram as well. Main currently has no native
pending/retryable work; 28 X and 45 Telegram uncertain historical events remain.
Code recovery alone does not manufacture new delivery work or receipts.

## Changes

- Before an irreversible send, reserve an isolated CAS attempt journal. Provider
  timeout, malformed acceptance or failed confirmation writes remain unknown.
  Existing attempts never become automatic retries. Missing runtime branch,
  permissions, SHA conflicts or corrupt identity fail closed.
- Persist delivery-budget counters outside main before sending. A failed main
  push cannot free daily capacity. Keep X<=20/day, >=45-minute spacing and
  Telegram<=100/day; lower configured caps are respected. Reserve both acceptance
  day and due day for X when scheduling across midnight. Unknown attempts count
  conservatively. This does not prove historical legacy usage is captured.
- Buffer reconciliation may fail without preventing the worker from evaluating
  Telegram. X requires a complete, valid, <=10-minute provider snapshot from a
  successful reconciliation. Missing/failed evidence holds X. Reports and state
  persistence run after processing, then the reconciliation error remains a
  visible workflow failure. Telegram delivery is never inferred from that error.
- Native Telegram uses one sendMessage call, with tracked URL. It never follows
  an ambiguous sendPhoto timeout with another send. Confirmed message IDs remain
  required.
- Provider reconciliation rejects unrelated hosts, ambiguous matches, malformed
  rows, repeated cursors and incomplete pagination. For an isolated unknown
  attempt, a unique provider match additionally needs createdAt within -5/+120
  seconds of the attempt, or an existing exact provider message ID. Successful
  reconciliation closes the isolated journal before main; delivered cannot be
  downgraded. This narrow time window intentionally holds uncertain cases.
- Five legacy workflows share the native lock and are disabled when single-writer
  cutover is enabled. Historical backfill/bootstrap additionally require a
  separate disabled-by-default replay flag. Adapters refuse non-native senders
  after cutover. No new heartbeat or scheduler is introduced.

## Buffer request budget

The collector, reconciler and native X adapter use one CAS request-budget identity
on `codex/social-outbox-runtime` after cutover. Reserve before each HTTP request;
no caller gets a permissive fallback if the journal is unavailable. Defaults are
12 requests/day and 30 requests per local rolling 30-day accounting window, with
hard configuration ceilings of 12/day and 100/30d. These are conservative local
ceilings, **not claims about Buffer's free quota or its reset date**.

Provider HTTP429 or GraphQL RATE_LIMIT_EXCEEDED persists a cooldown. An explicit
30d window conservatively blocks for 30 days from observation; other limits block
for at least an hour. Longer Retry-After is honored. There is no automatic retry,
paid upgrade, alternate account or quota bypass. All cooperating callers see the
same cooldown, even if their workflows differ. Local accounting can sacrifice
throughput to remain bounded; it cannot restore exhausted provider capacity.

The existing collector's raw successful snapshots remain unchanged on failure.
Combine with Draft #168 for per-source degraded reporting and stale metrics.
An ambiguous send still requires reconciliation after quota recovery; cooldown
expiry never authorizes resending an unknown attempt.

## Activation prerequisites — not executed

1. Review this Draft and CI together with the R0 evidence and #168. Keep R1
   receipt blocked: the user confirmed existing OpenAI credits are not restored.
2. Disable native sending and all five legacy send routes, and drain active jobs.
   Check external webhook callers; do not rerun historical jobs. Preserve all
   main events, 73 unknown histories and existing receipts.
3. Provision `codex/social-outbox-runtime` from reviewed main with existing
   contents-write authority. Do not create an empty substitute if an existing
   branch or journal cannot be read. Inspect branch rules normally.
4. Cut over at a fresh Asia/Shanghai day boundary after legacy writers were
   stopped, or establish audited same-day legacy usage in delivery-budget
   records. Native main events alone cannot account for earlier evergreen or
   webhook sends. Provider baseline evidence and daily counters must be reviewed;
   missing historical usage is not zero usage.
5. Enable SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED only after that drain/baseline.
   All routes must see the same repository variable; the native worker refuses
   sending before acceptance. Do not set SOCIAL_LEGACY_REPLAY_ENABLED.
6. First run send-disabled, inspect real journal access, quota/cooldown evidence,
   provider pagination, cap union and event identities. Then one normal fresh
   native run with a reviewed new pending event may test confirmed delivery.
   This document does not authorize synthesizing a published event just to test.
7. Verify provider message ID, runtime attempt and budget reservation, main event
   and persistence. For provider unknowns, demonstrate next run holds them. With
   Buffer cooling down, verify no Buffer HTTP request and independent Telegram
   behavior. Retain the visible partial-failure result.

## Tests and limitations

59 offline core tests passed, including actual worker/reconciler execution with
mock network; existing 14 data tests passed. Quality check, workflow YAML parsing,
production-indexable build and production SEO passed locally. CI adds the social
suite. No live provider send, Actions rerun, runtime branch provisioning or merge
was performed. Offline tests are not production acceptance.

Unknown Telegram historical sends have no reliable provider search API in this
implementation and remain held. There is no claim of exactly-once delivery for
all historical routes. The absence of active native debt does not establish
healthy future cadence. Provider limits, unavailable access and the R1 credit
blocker still require external evidence before unattended recovery can be signed.

## Rollback

Before merge, close the Draft. After future activation, stop native sending and
drain writers first. Revert code through a new codex PR; retain all isolated
attempts, delivery/request budgets and main events. Do not simply turn the
single-writer switch off: that would re-enable legacy routes while unknown native
attempts exist. Resume any old route only after reconciling those identities and
re-establishing one writer and audited daily usage. No receipt/history deletion.
