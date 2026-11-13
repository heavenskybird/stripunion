# Native social channel runtime — candidate, not activated

Issue #175 follow-up. This branch is independent of Draft #180 and starts at
main `74c772e3`. It changes actual Native workflow/worker/adapter wiring, not only
the offline planner. No variable, runtime branch, historical event or production
state is created or changed by implementing or testing this candidate.

## Switch contract

All three switches default **false**. Only literal true/false values are accepted
(case-insensitive in scripts); malformed active configuration fails closed.

| Global `SOCIAL_OUTBOX_SEND_ENABLED` | `SOCIAL_OUTBOX_X_SEND_ENABLED` | `SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED` | Native result |
| --- | --- | --- | --- |
| false or absent | any | any | `PAUSED_BY_OPERATOR`; no runtime read, sync, reconciliation, send or persistence. Operator pause takes precedence over unused malformed channel settings. |
| true | false/absent | false/absent | `PAUSED_NO_CHANNELS`; no operational work. |
| true | false | true | Telegram-only; no Buffer credentials passed to worker, no Buffer reconciliation/read/send, X events unchanged. |
| true | true | false | X-only, requiring accepted Buffer budget and fresh reconciliation; no Telegram credential or send. |
| true | true | true | Both evaluated independently; failed Buffer reconciliation holds X, Telegram may proceed. Buffer failure stays visibly red after channel results persist. |

An enabled channel additionally requires `SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED=true`,
canonical repository/main, Native workflow and run attempt1. A read-only runtime
preflight verifies the already provisioned isolated branch **before sync**.
Missing state never creates an empty runtime or grants fresh counters. Individual
CAS journals and durable delivery budgets remain authoritative before provider
calls; a preflight success alone is not delivery acceptance.

The Native worker filters disabled channels before loading Buffer evidence or
claiming event journals. Disabled events are not rewritten. It still rejects
historical/unknown `reconcile_required` attempts and respects existing caps,
spacing and provider/local receipt deduplication. Tests include all73 unknown
events and duplicate pending identities; none can cause a replay.

Buffer data collection remains a separate concern: `seo-data-daily.yml` is not
gated by sending switches and keeps reporting real failed/stale Buffer health.
Its shared budget/cooldown guard still applies. “Telegram-only zero Buffer
requests” describes this Native delivery pipeline, not suppression of independent
SEO diagnostics.

## Legacy routes are not an alternate writer

All five old workflow routes now receive explicit per-channel switches and gate
channel-specific work. Their previous global pause, historical replay and
single-writer job fences remain. Sender adapters now **always** require the
accepted canonical Native writer, including when the single-writer flag is absent
or false: enabling a channel cannot accidentally activate an unjournaled legacy
fallback. Old direct routes cannot resume real publishing by toggling these new
flags; migrate content to the existing enqueue path instead of rerunning them.

This deliberately closes the old pre-cutover direct-send fallback. Do not weaken
the adapter guard to make an old workflow green. No legacy run was started here.

## Independent dependencies

Draft #180 retains its own offline classification, numeric Telegram-ID fix and
report. This candidate does not cherry-pick it or modify its branch. For a real
trial using a numeric Telegram channel ID, #180's normalization fix must first
be reviewed and deployed, or that ID cannot be assumed valid. Existing named
`@channel` configuration is unaffected; no configured identity is asserted here.

## Controlled cutover — requires separate authorization

This document grants no activation permission. Real sending remains unaccepted.

1. Keep global=false and X=false. Finish the required R1/release acceptance and
   inspect current main, active social jobs, actual channel identity/permissions,
   all73 historical dispositions and journal SHA evidence. Unknown historical
   deliveries remain quarantined; no deletion, retry-state promotion or fake
   delivery is part of cutover. Record the explicit operator decision for any
   unresolved quarantine before considering new delivery.
2. With sending still paused, provision/accept the isolated runtime through its
   separately reviewed procedure. Verify existing CAS journals/counters and
   current budget windows. The preflight implemented here only reads a branch;
   it does not provision one or accept a broken budget.
3. Explicitly create/review the new repository channel variables **while global
   remains false**. For a Telegram-only candidate set X=false and Telegram=true;
   confirm the canonical Native single writer is accepted and legacy ownership
   cannot compete. No Buffer quota purchase, reset or extra provider read is
   required for this path.
4. For an authorized one-new-event trial, configure
   `SOCIAL_OUTBOX_BATCH_SIZE=1`, `SOCIAL_OUTBOX_TELEGRAM_DAILY_CAP=1`, and X=false
   before the global switch is considered. Batch default is now1, maximum5;
   caps remain maximum20 X/day and100 Telegram/day. A durable daily cap of1
   prevents a second cron/wakeup from sending another event before review.
   Do not reset the daily counter to obtain another trial slot.
5. Only a separate explicit operator authorization may set global=true. Observe
   one normal Native run, verify exactly one new event, CAS claim-before-send,
   provider message ID, journal and main persistence. Confirm Buffer step skipped
   and zero Buffer request counters. No prior unknown event may become retryable.
   A timeout is unknown acceptance and must not trigger another irreversible call.
6. Re-pause global after the trial and review evidence before expanding any cap.
   Enable X only after its own provider allowance, cooldown, request budget and
   complete fresh reconciliation acceptance; Telegram success proves none of
   those X prerequisites.

## Rollback / failure handling

Global=false immediately closes both channels at admission and adapter entry.
Setting only X=false stops Native Buffer work without blocking accepted Telegram
operation. Let any in-flight irreversible request finish; drain the writer rather
than canceling and replaying it. Preserve provider receipts, all history,
isolated journals, counters and held ambiguity. A missing runtime, CAS conflict,
invalid counter or unconfirmed provider result fails closed.

Revert code through a new reviewed PR while paused. Do not revert operator pause,
single-writer guards, historical replay protection or cooldown state, and do not
reset counters/receipt branches to make red checks disappear. Original R1
Scheduler and Receipt are outside this candidate's write scope.

## Offline acceptance evidence

Tests exercise actual adapters, admission CLI, Buffer reconciler and worker:
global-off switch matrix produces zero GitHub/provider requests; missing channel
switches stay off; Telegram-only succeeds without Buffer credentials or evidence;
X cooldown/reconciliation failure holds X while Telegram proceeds; unaccepted
writer/historical contexts make no request; all73 unknowns stay unchanged;
duplicate identities cannot send twice. Existing cap/spacing/monthly-cooldown
tests remain enabled. Provider calls are intercepted by local mocks; none of
this evidence establishes successful real sending or provider credentials.
