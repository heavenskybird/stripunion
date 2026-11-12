# Guarded generation adapter — disabled pending production review

Stacked on unchanged PR179/head38539aaa. These modules implement an opt-in
provider-injected worker, immutable novelty review binding, and a real GitHub
Contents CAS budget-store adapter. Current Producer/Scheduler imports and workflow
definitions are untouched. No provider transport or credential is supplied by
default; disabled invocation returns PAUSED_BY_DEFAULT before calls or writes.

Budget storage is restricted to codex/editorial-budget-runtime and its isolated
journal; there is no automatic provisioning or missing-file success fallback.
Fresh verified model prices, scoped credit proof, verified input token upper
bound, per-batch/day request/token/USD limits and a successful reservation CAS
are required before the injected provider is called. Unknown/timeout/completion
CAS failure retains reservations and prevents replay or credit release across
midnight. A pure budget result is not a lease; the journal is authoritative.
The existing gpt-6-luna pricing config is UNKNOWN, so real spend remains blocked.

Novelty preflight checks every candidate against the full supplied corpus and
other candidates, binds candidate/batch/corpus commit+content to an expiring
review receipt and requires independent review provenance. It never grants
publication: compiler, source/claim, SEO, visual, deployed HTTP/fingerprint and
Ledger gates remain mandatory. The known cross-category age-check overlap is
blocked in integration tests. CLI reviewed-preflight is offline-only.

Validation:94 script tests passed, including CAS race(one provider call), unknown
outcome/no replay, lost completion CAS, budget overflow, disabled zero-call path,
real overlap and stale review/corpus/batch bindings. Tests inject all transports;
no API calls, paid generation, branch provisioning or historical edits occurred.

Activation requires separate exact-head review, verified model-specific official
rates/credit scope, reviewed journal provisioning, current token bounds, single
writer/CAS acceptance and24h/72h reliability evidence. Integrating into the live
Producer is a separate controlled change. Rollback keeps the journal and unknown
reservations, disables the optional adapter, and removes only its future callsite;
never refund ambiguous spend or reset R1 history. This Draft is not deployed.
