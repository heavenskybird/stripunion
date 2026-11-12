# Cadence recovery: read-only independent watchdog

Source baseline: `ab0f9258`, canonical `heavenskybird/stripunion`, default branch
`main`. This PR changes no workflow, scheduler state, receipt, content or sender.
All times below are UTC; add eight hours for Asia/Shanghai.

## Evidence and confidence

| Observation | Evidence | Confidence / limit |
| --- | --- | --- |
| First recovery output completed | Run [43151510253](https://github.com/heavenskybird/stripunion/actions/runs/43151510253), started03:56:44.969, finished04:05:23.935 | Confirmed five new URLs200 + source fingerprints + ledger + quality/visual |
| Next eligibility04:48:44.969 | `scripts/editorial-r1-runtime.mjs`: success delay52m from **startedAt**, not finishedAt | Confirmed code, not a guaranteed delivery time |
|04:20 wake correctly skipped | [43154118859](https://github.com/heavenskybird/stripunion/actions/runs/43154118859), backoff remaining1,701,418ms | Confirmed, never count as another publication |
| Second output started07:06:00.568 | [43172741943](https://github.com/heavenskybird/stripunion/actions/runs/43172741943), natural workflow_run, finished07:12:19.109 | Confirmed output; eligibility-to-admission gap137.26m |
| Third output started08:50:46.668 | [43186274604](https://github.com/heavenskybird/stripunion/actions/runs/43186274604), natural workflow_run, finished08:55:29.759 | Confirmed output; eligible07:58:00.568, gap52.77m |
| Multiple workflow schedules show long gaps | Production snapshot03:56, Visual QA04:17, Telegram evergreen07:05, SEO08:25, Authority08:50, Native08:51 | Confirmed sparse delivery across independent workflows; infrastructure cause not proved |
| Scheduler enabled at preflight | [43150857711](https://github.com/heavenskybird/stripunion/actions/runs/43150857711), stateactive03:50; later real admissions07:06/08:50 | Confirmed at those observations, not an administrative-state read at every minute |
| Actor account deactivation not established | Recent scheduled Authority/Native/Telegram runs actor`heavenskybird`; same actor associated with earlier successful scheduler | Observed identity, not privileged account-status evidence. Recent schedules argue against blanket account deactivation |
| Two old queued records have zero jobs |37655513979/37655528917, head710276134f67023864e4e83992cf46080a1c43d8 | Not evidence of a held R1 lock; never classify arbitrary zero-job queued writers as harmless |
| Bridge exists, not recently exercised | Main bridge source trusts only bot/stripunion-heartbeat-kicks push; scheduler guard accepts successful same-repo bridge | Configuration confirmed. No new kick performed; current end-to-end bridge health UNKNOWN |
| External Heartbeat disabled | Existing task6ac73b9b61908191a96f759e413f06a3 observed disabled during recovery; existing independent read-only recovery observer remains separate | Explains absence of external compensation, not primary GitHub cron delivery failure |

**Root cause classification:** missing/delayed natural wake delivery is confirmed;
no evidence supports blaming a stuck writer lock or active-actor deprovisioning.
GitHub load/drop/registration defects remain hypotheses. Cron syntax exists on
main and recent other scheduled workflows prove some schedule service delivery;
they do not prove this particular cron was registered or every event delivered.
No registration refresh, cron edit, actor change, cancellation or state toggle
was performed. Account status/registration internals remain UNKNOWN.

## Official source verification

Retrieved from GitHub's official `github/docs` source on2026-11-12:

- [Events / schedule / actor / workflow_run](https://github.com/github/docs/blob/main/content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md).
  Schedules run on the default branch; public inactivity can disable them;
  actor status matters; workflow_run chains are limited to three levels.
- [Schedule delay](https://github.com/github/docs/blob/main/data/reusables/actions/schedule-delay.md):
  high load can delay schedules and some queued jobs can be dropped. This is
  documented possible behavior, not proof that load caused this incident.
- [GITHUB_TOKEN non-recursion](https://github.com/github/docs/blob/main/data/reusables/actions/actions-do-not-trigger-workflows.md):
  token-caused events generally do not create new runs, with dispatch exceptions.
  Canonical Producer pushes therefore cannot be relied on to create push-driven
  snapshot/build/visual wakeups. Explicit Native dispatch does create a run:
  43152464759/43173526683/43186946079. Do not assume its completion forms an
  unbounded self-waking loop. Token suppression / chain-depth constraints are
  verified platform design constraints; the cause of each missing workflow_run
  event is UNKNOWN without its delivery metadata.

## Implementation and independent clock

`cadence-watchdog.mjs` is an offline pure decision engine and JSON CLI. It rejects
GitHub-cron as its own clock source, stale/partial evidence, unknown state, future
timestamps, missing receipt SHA and invalid history. Decisions distinguish missing
schedule, delivered-but-unadmitted wake, backoff, active writer, production failure,
incomplete producer, operator pause and evidence unknown. Grace defaults15m and
does not redefine R1's52m eligibility. stdout is a sanitized alert; exit2 means
the independent caller must surface it rather than silently discard it.

`cadence-github-snapshot.mjs` is a GET-only collector. It can execute from an
existing authorized local/external clock without GitHub Cron. It reads main's
workflow state, receipt SHA, latest scheduler events, all active-status inventories
and actual jobs. Oversized inventories fail closed. It never logs its credential
or provider bodies. Use an existing read credential with repository contents/actions
read; no admin, provider key or paid service is required.

```sh
# Run from the existing external clock / local runner, not a new GitHub cron.
node scripts/cadence-github-snapshot.mjs > /tmp/stripunion-cadence-evidence.json
node scripts/cadence-watchdog.mjs /tmp/stripunion-cadence-evidence.json
```

The existing ChatGPT recovery observation supplies an independent hourly clock
and previously detected overdue runs while GitHub had no new events. It can
consume this versioned evidence contract using its authorized connector reads.
Do not label unavailable workflow state as active: emit EVIDENCE_UNKNOWN instead.
This Draft PR **does not install a new task, configure credentials, change the
existing monitor prompt or activate a compensation sender**. Live collector
binding is still a rollout step; offline mocks prove detection during simulated
GitHub cron failure, not a newly deployed external SLO. The existing monitor
continues its current read-only work. If its connector cannot read a required
endpoint, preserve that limitation; no credential/safety bypass.

## Single bounded compensation design — disabled

`planCompensation` always returns execute=false. A future separately reviewed
implementation would require active Scheduler, successful valid receipt, fresh
complete inventory, no actual or pending writers, matching receipt SHA, a unique
durable CAS reservation keyed by repo/receipt/cycle, and one normal Scheduler
workflow_dispatch on main. Repeat the SHA/queue check immediately before the
request. Preserve a reservation after an ambiguous response, never resend on
timeout; query run evidence instead. Never rerun historical jobs, edit a receipt,
dispatch the Producer directly or accumulate one batch per missed hour. R1's
single writer and admission remain authoritative after the one wake. Mock tests
cover duplicate reservations, writer races, old zero-job metadata and missing
evidence. No activation flag can turn this PR into a sender.

## Observation result and rollout

The original observation43150426975 ended06:48:28 with
OBSERVATION_WINDOW_ENDED_INCOMPLETE, not a Producer failure. Artifact13921487872
SHA256208a3a6147f9a005f422c4aa53823104f62ff92f0ef4029dd9baac681a58e88e
records only first cycle accepted04:06:14.342. Its automatic-pause coverage has
ended; it was not restarted. R1's own bounded failure/admission mechanism remains.

Three consecutive actual publication executions have independently passed their
business gates (fifteen distinct source slugs/IDs, five200+fingerprints each,
quality/visual, monotonic ledger); third independently checked09:31:05UTC
(17:31:05Asia/Shanghai). This begins an observation baseline, not a24h/72h pass.
**Cadence reliability remains failed** because long delivery gaps persisted.
Initial age-check intent overlap remains a quality warning, not fabricated
Google classification or a retrospective publication failure.

All code is standalone and unimported by production. Safe merge candidate after
CI/review; no automatic merge. A main merge can still trigger the existing generic
Hostinger auto-build, so existing deployment acceptance applies. Rollback is a
scoped PR removing only these tools/docs; preserve receipt, content and all ledgers.
