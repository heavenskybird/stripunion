# Reviewed offline recovery integration

## Current release refresh

After the first integration, refreshed without conflicts to current production
main386faf7a7cb18e6fa1471ecef1dcce7aefce2a28 (fifth batch closure). Joint105
reliability tests, staging and production builds, robots, SEO and GA4/Clarity
Consent artifact checks reran successfully. No production runtime paths changed
relative to that main. Release source audit now covers1,600 guides/1,279,200 pairs,
3,625 heuristic warnings, at source tree recorded in the temporary refreshed
report. Older counts below are historical acceptance snapshots, not live totals.

Fifth real run43213236095 is event=schedule, started11:55:10.046Z and finished
12:01:46.825Z. Quality/visual steps, five final200+source fingerprints and all
five monotonic Ledger records independently reread. This is25 published guides,
not proof of timely Cron: fifth admission was75m49s after its eligibility time.
Its30,707 input+12,556 output Tokens update total to250,577, six requests/one
retry across five runs; price/invoice/credit remain UNKNOWN.

Existing hourly observer binding confirmed enabled and pinned to immutable
6768aed9. Its post-binding external observation19:55Asia/Shanghai executed
the adapter and CLI against fresh actual connector data, classified WRITER_ACTIVE
for the fifth run and notify=false. Task metadata recorded last_run_time11:55Z,
but run_details identity/delivery are unavailable: no claim of alert delivery or
cross-executor cache persistence. Compensation remains disabled. The pinned
tool code is unchanged by this main/source refresh.

Base main: `74c772e3d2ec70c808b7e7af322426f95edffaf5` (fourth real batch
closure). Exact reviewed heads merged with `--no-ff`, no conflicts:

| PR | Reviewed head | Scope |
| --- | --- | --- |
|177|d2d5fef58654d6fdd4b48e3df21a43ed8671e58b|Blog offline workbench|
|178|56d8fd297b4d82aa1475e531dd48df1dc5bca42f|Attribution/Consent diagnostics|
|179|38539aaa1234c258307c302c854d90606fdec225|Novelty/cost toolkit|
|181|3af38904cf933a099cacbdb88b74f373d3836b88|Independent cadence tools|

PR180's runtime Telegram adapter and Outbox rollout are deliberately separate.
Individual COMMENT reviews were read before integration. The original heads and
independent PRs remain preserved. Use this one integration PR for a future safe
release instead of four main merges. Nothing was merged to main in this task.

## Joint validation

-105 root reliability tests,15 data-layer tests,14 Worker tests passed locally.
-`npm run check` passed; staging-safe Astro build and exact Disallow:/ artifact
  passed; production-indexable build, production SEO and actual GA4/Clarity
  Consent artifact checks passed. Local Astro telemetry disabled to avoid writing
  outside the workspace. No provider calls in tests.
-Current integration source audit:1,595 guides,1,271,215 considered pairs,
  3,614 heuristic warnings. Known incident remains detected. Full temporary report
  `/tmp/stripunion-integration-novelty.json` has auditedCommit and source-content
  SHA256. Existing committed1,590-guide report is explicitly stamped as historical
  `ab0f925823cc82dfbd5a653de3c5172945c074ad` at its original generatedAt. A future
  batch does not retroactively enter either snapshot. Warnings require human
  review; no Google classification or automatic published-content rewrite.
-Fourth run43194534112 job131101966359 usage independently reread:29,730 input,
  9,805 output, one completed request. Four runs total151,063 input+56,251 output
  =207,314 tokens, five requests/one retry. Price, invoice and balance UNKNOWN.

No production Scheduler/Producer/workflow, Worker, deployed page, affiliate link,
publication queue, historical Ledger/Outbox event, Receipt or repository switch
is changed. Helpers remain unimported by production. No novelty/cost enforcement
or Blog publishing activation is included.

## Watchdog integration acceptance

Added connector GET-result adapter and local-only notification deduplication runner.
Classification distinguishes cooldown, due/grace, missing events, delivered but
unadmitted wake, exact Admission skip, actual writer, failure, incomplete run,
operator pause and unknown/stale evidence. A missing workflow metadata capability
stays UNKNOWN; successful publication never forges an active administrative state.
Known cooldown can still be calculated from a valid receipt while this capability
is absent. A normal cooldown does not falsely resolve an earlier capability alert.

Supervised external-clock acceptance2026-11-12T10:28:17Z:

-GitHub connector authenticated GET reads succeeded for repository/default main,
  current runtime file/blob, run inventory for five active statuses and both old
  zero-job records. Receipt ee5b6f7fb8398ae40a018e9e0c136f9335b14a62 was success,
  run43194534112. Active inventory complete; no new producer writer.
-Two actual CLI executions10:28:22.950Z/10:28:23.032Z returned
  ADMISSION_BACKOFF, next eligible10:39:20.777Z, notify=false, productionWrites=0,
  providerRequests=0. Clock is outside GitHub Actions/Cron.
-Workflow metadata URL is unsupported by the connector (INVALID_ARGUMENT), not
  an upstream production denial. This limits distinguishing operator-disabled
  from missing schedule once overdue. It will emit a deduplicated EVIDENCE_UNKNOWN
  alert rather than guessing SCHEDULE_MISSING. A full administrative-state read
  still needs an authorized read-capable transport; no new token requested here.
-Alert target is the existing ChatGPT "StripUnion 恢复观察" task. Its hourly clock
  is preserved; only its read-only prompt is to be pinned to this integration
  revision after CI. This is not the disabled write-capable Producer Heartbeat.
-Local notification cache is only
  `/workspace/scratch/stripunion-cadence/notifications.json`, protected by an
  exclusive local lock and atomic rename. No GitHub state is written. Repeated
  same incident is suppressed; one recovery notice is allowed. Unknown capability
  alerts are not reissued merely because another batch changed the receipt.
  If cache/history is unavailable, report deduplication UNKNOWN; do not pretend
  cross-executor persistence or delivery was verified.

Reproducible minimal adapter flow from the existing observer:

1. Read pinned `cadence-watchdog.mjs`, `cadence-observer.mjs` and
   `cadence-connector-adapter.mjs` through the authorized connector (or use this
   exact checked-out commit); collect fresh GET evidence within5m. Never use
   old PRODUCTION-ACCEPTANCE.json booleans as current state.
2. Feed `connectorSnapshot` the GET repository, UTF8 runtime file+blob, latest
   main runs, all five status inventories, actual jobs for each active run, and
   optional supported workflow metadata. Parse actual recent admission log lines
   via `admissionEvidence`; unreadable logs remain unavailable.
3. Write only the external observer's temporary evidence/cache and execute
   `cadence-observer.mjs EVIDENCE.json LOCAL_CACHE.json`. Deliver an anomaly to the
   existing ChatGPT user only when notify=true; include classification/time/Run.
4. Keep execute=false for compensation. No dispatch/kick, Receipt write, old-run
   replay, scheduler/Heartbeat toggle, provider call or production writer.

## Deployment consequences and rollback

All four constituent PR previews already exist; a new Draft creates one additional
Hostinger PR preview. These are not production acceptance. A future **single**
main merge can trigger existing Hostinger canonical-main auto-deploy, Build and
Hostinger acceptance workflows. Cloudflare Worker deploy paths are unchanged
(`services/live-models-worker/**` and its deploy workflow), so this integration
does not trigger that Worker deployment. Editorial/Blog queue trigger paths and
live sender settings are unchanged. No production deployment is performed now.

Before any main merge: recheck writers and current main, exact-head joint CI,
operator sending false, pending publication safety and intended one-site-build
impact. After a future merge: verify actual production HTTP/GA4/Consent/canonical
and guide fingerprint continuity; retain Hostinger previous completed build.
Rollback through one scoped revert PR for the standalone integration only; never
rewind content, Receipt, Ledger or historical Outbox. Observer prompt rollback is
restoring the prior read-only prompt; no old Heartbeat activation.

## Reliability boundaries

Observation baseline remains2026-11-12 17:31:05Asia/Shanghai. Earliest checkpoints
are November13/15 at17:31:05, conditional on continuing evidence. Four real business
batches do not prove GitHub Cron reliability. Original observer43150426975 ended
with its1/3 artifact; it is not restarted or relabeled. Existing R1 admission
failure bounds remain. Runtime consent, Blog chain, per-channel Telegram and
durable generation guards are separate reviewed branches/releases.
