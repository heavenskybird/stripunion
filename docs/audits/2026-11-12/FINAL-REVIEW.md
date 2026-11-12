# PR #170 final operational review

This supersedes the November11 inference that old queued records prove a held
writer lock. It is merge readiness evidence, not production/rearm acceptance.
Times below are Asia/Shanghai; JSON timestamps are UTC.

## Operator pause

The Native Outbox now evaluates the operator switch before dependency install,
ledger sync, reconciliation, sending, reporting or persistence. Explicit false
emits PAUSED_BY_OPERATOR in logs, outputs and Step Summary and completes normally.
It does not claim delivered content or modify uncertain historical events.
Enabled reconciliation failures still fail the sending workflow after safe channel
processing. Missing switch defaults to paused; malformed values fail closed.

Real isolated preflight [43144126423](https://github.com/heavenskybird/stripunion/actions/runs/43144126423)
ran the same workflow at code5a7dafa9 with the actual repository variable=false:
admission passed; install, sync, Buffer reconcile, worker, report, persist and the
final provider-failure step were all skipped. No provider operation was executed.
The isolated test branch cannot enable sending and uses a different concurrency
group, so it cannot replace pending main delivery jobs. Main retains its existing
native-social-outbox group and latest-canonical-main checkout behavior.

78 core,15 data and14 Worker tests passed. Tests execute the paused admission
CLI with a network trap, verify zero calls/no state artifacts, all workflow gates,
enabled failure visibility, and independently degraded Buffer collection with
the send switch false. The SEO workflow is not gated by social pause: per-source
outcomes/freshness and its Buffer degradation remain visible. This is not a fix
for Buffer's provider30d quota and no Buffer request was used to verify the pause.

## Queued runs: evidence and safe disposition

API200 for37655513979 and37655528917 still reports queued since October7 UTC,
but both have zero jobs. New authority run43131310344 completed successfully on
November12, one evaluate job; its log says AUTO_PROMOTE=false, mode=shadow and no
promotion commit. Old/new authority definitions use control-plane-authority-promotion;
R1 uses a distinct editorial-hourly-producer group. Visual QA has its own ref/event
group. These facts do not establish that the old records hold any active R1 lock.

No cancellation/deletion/rerun was performed. Retaining the anomalous metadata
is safe for this merge; do not make its disappearance a rearm prerequisite.
Optional cleanup: after confirming the scheduled intent is obsolete and still
zero-job, the owner can cancel those exact runs, retaining the history. Do not
rerun them. The older authority workflow used AUTO_PROMOTE=true, so removing its
obsolete future execution intent is reasonable hygiene, not an evidenced lock
repair. Immediately before rearm, inventory actual running/pending writer jobs
again, including manual Producer/legacy publishers and Outbox.

## Merge deployment effects: verified, not assumed

[Read-only evidence43144689227](https://github.com/heavenskybird/stripunion/actions/runs/43144689227),
2026-11-12 10:55:33; safe detail in deployment-gates.json:

- Hostinger API200: canonical repository=true, branch=main,
  autoDeploymentEnabled=true. A merge to main triggers the existing production
  deployment. Hostinger PR preview also rebuilds branch pushes independently;
  preview success is not production acceptance. Node settings/builds are readable.
- Current completed Hostinger rollback build:
  `01a1c998-5885-7345-836f-7f9179b7b10d` (11/11 15:52:46).
  Provider commit SHA is not exposed here; do not invent it.
- LIVE_MODELS_WORKER_DEPLOY_ENABLED is actually **true**. PR170 changes
  services/live-models-worker, so a main push matches Deploy live models worker
  and passes its flag condition. It will test, deploy via existing Wrangler/token
  and run existing smoke checks. No flag is changed by this repair.
- Cloudflare deployments API200 confirms baseline deployment
  `76ce21f8-26f3-4830-b908-be7a069cab09`, active version
  `b3effa9a-721c-4d0b-b641-2416e9fc55e8` at100%. Credential values/account ID
  are not logged. No Cloudflare write was performed for verification.
- Wrangler bindings/migration definitions are unchanged versus main. Worker
  changes are first-click idempotency and additive diagnostic fields; no new
  migration, data deletion, event replay or revenue reconstruction is involved.

Rollback if a deployment regresses:

1. Keep Scheduler disabled and social send=false. Do not change receipt or enable
   single-writer/sending during rollback.
2. Hostinger: use the recorded completed build for immediate site rollback if
   needed, then a focused codex PR restoring only affected site code to the
   baseline. Keep GitHub's pause/admission, legacy kill switches and budgets.
3. Worker: use existing Cloudflare version rollback to the recorded version100%
   (or its documented deployment API), then reconcile source via a reviewed PR.
   Roll back executable code only; preserve Durable Object storage and all new
   diagnostic/attempt history. No delete/reset/migration rollback.
4. Avoid a blanket revert of170: it could restore unguarded legacy send paths.
   Recheck HTTP/fingerprints, GA4 consent and Worker health/version after recovery.

## Frozen controls and readiness decision

Scheduler=disabled_manually; social send=false; single-writer=UNSET. Receipt is
still failure/cycle41254032304/attempts3, blob
`8f204ec0fe1477f9c3627b75d3d692506e47d4e4`, unchanged history hash.
No historical Producer, real send, runtime provisioning or rearm was run.
The single previous OpenAI proof was not repeated.

Deliver only integrated170, not167–169 separately. Deployment effects are explicit
and rollback baselines available. READY_TO_MERGE requires final-head Build and
responsive Visual QA green, unchanged controls and GitHub's normal merge gates;
it does not require clearing zero-job historical queue anomalies.

After merge, the next stage is **actual production deployment acceptance**:
record merge/build/version identity, main/blog HTTP and five fingerprints, GA4
tag/consent and Worker health. Only afterward, with current API capacity and a
fresh actual writer inventory, prepare the receipt SHA-CAS rearm. Three new real
production cycles and subsequent24/72h monitoring remain future acceptance.
None of those stages is completed by pre-merge CI or this review.
