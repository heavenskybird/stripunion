# Recovery implementation and rearm preparation

Evidence times are Asia/Shanghai unless stated; JSON preserves UTC. This is a
review candidate, not a production recovery declaration. Canonical main remained
`0e10ce79f8bfebbab74a7937101163b00d1062fd` during verification.

## OpenAI: authenticated one-request verification passed

[Run 43050374954](https://github.com/heavenskybird/stripunion/actions/runs/43050374954),
2026-11-11 23:38:35: existing repository OPENAI_API_KEY, actual production model
variable resolved to `gpt-6-luna`, exactly one Responses API request, HTTP200,
status=completed, READY, input11/output5 tokens, output cap128, store=false.
No request body, response text, Key or organization/project IDs were logged.
Headers identified effective organization/project context; the successful request
proves access for this Key, not identity of the account shown in the billing UI.
The former credit_balance_exhausted error did not recur in this request.

The branch-created/run-attempt guards prevent subsequent pushes and reruns from
making another paid request. Error classification distinguishes explicit credit,
project/organization quota, rate and model/access errors; nonspecific quota errors
remain scope-undetermined. No organization/project limit changes were attempted.
This is a timestamped access proof, not a guarantee of later remaining balance.
After the user's later quota message, no additional paid verification was made.

## Integration

Merged fixed latest heads in the isolated integration branch:

| PR | Head | Review |
| --- | --- | --- |
| #167 | c068d047 | Generator/provider safeguards and R0 evidence |
| #168 | 097525dd | Source-independent outcomes and stale Buffer reporting |
| #169 | 1c34fdd6 | Persistent social attempts, delivery/request budgets and channel isolation |

All three merged without conflicts against the unchanged current main. Shared
Build and SEO workflow edits retain all tests, status reporting and Buffer budget
environment. No protected receipt, manifest, backlog, Ledger or event files changed.
The integration adds the verified follow-up fixes below. Prefer reviewing the
integration rather than bulk-merging old #164/#165 or assuming #169 alone closes
the operator kill-switch gap.

### Follow-up fixes

- Old five social routes now require explicit SOCIAL_OUTBOX_SEND_ENABLED=true,
  and the adapters reject operator false even before single-writer activation.
  Original #169 only disabled those routes after the single-writer flag was true;
  with that flag unset, the operator's Native variable did not stop old routes.
- Buffer calls now fail closed until accepted runtime budgeting is available.
  There is no unbudgeted pre-cutover fallback for the collector or reconciler.
  Buffer remains explicitly unavailable/degraded until provisioning and quota
  evidence are ready; other channels/sources remain independently evaluated.
- GA4 root cause established: Hostinger env metadata lacks the main measurement
  variable and actual main HTML has no GA4 loader. Use the existing canonical
  public stream `G-K57BRX69X1` as code fallback, verified from first-party Admin
  metadata (property530171093, defaultUri https://stripunion.com). Explicit valid
  env overrides still win; invalid config fails visibly. Existing production-only
  and consent-default-denied behavior stays in force, staging loads no GA4.
- Attribution duplicate click ingestion now preserves original metadata; retries
  previously overwrote the click without moving its already-counted acquisition
  bucket. New-window diagnostics distinguish missing/invalid memberId, absent
  click records, unknown currency and missing transaction IDs. Postback dedup and
  existing revenue counters remain. Historical unmatched records are not relabeled
  or reprocessed. Reports distinguish transport readiness from matching quality.
- Health probes release retry response bodies and retain bounded per-attempt
  timing, HTTP status and allowlisted transport cause codes. Denials stay terminal;
  there is no IPv4 fallback in production enforcement and no lowered health gate.
  Prior intermittent failure root cause remains unproven; new evidence makes it
  diagnosable instead of reporting only fetch-failed strings.
- Generator identifier context is factored into a tested full-inventory helper;
  older backlog/guide/unpublished IDs beyond the old tail windows remain visible.
  Existing quality/compiler/semantic-overlap checks remain authoritative.

## Real production observations

[Read-only run 43050698532](https://github.com/heavenskybird/stripunion/actions/runs/43050698532),
23:40:35; safe machine evidence in [recovery-verification.json](recovery-verification.json).

- Scheduler state=disabled_manually (API200). Native send variable exactly false;
  single-writer variable unset. Main's native worker checks false before any send;
  mock pending-event tests make zero provider calls under this switch. No native
  production workflow was dispatched to test sending. Current main's old routes
  do not honor that variable; the new integration guards have not been deployed.
- Receipt blob SHA8f204ec0fe1477f9c3627b75d3d692506e47d4e4, failure,
  cycle41254032304, last run41260561057, attempts3, history200 IDs, unchanged.
  Receipt state digest faaa7f0f8df0035b699717d352b51f923a7dd2a656b891039456945d1e801e48.
- Main checkpoint is the previous closed batch41249384691. All its five URLs
  returned real200 after the permitted same-path301; five SHA256 fingerprints
  matched /publication-deployment.json. This proves deployed old batch content,
  not deployment of the unmerged generator/GA4 fixes.
- Hostinger read-only API200: main found, latest build completed at15:52:46,
  1750 log lines, zero error lines, two warnings. Provider commit SHA unavailable;
  do not equate provider completion with the integration revision being deployed.
- Main/Blog homepage, robots and sitemap all200. AVCams homepage406, robots200,
  sitemap404. This is an observed upstream response, not a successful health check;
  no WAF/protection change or alternate identity was attempted.
- Attribution summary API200: clicks42, postbacks13, matched1, unmatched12,
  duplicate0, UNKNOWN-currency amount224.25. No deterministic old join repair is
  possible from aggregate counts. Future diagnostics distinguish contract errors
  from click arrival/retention gaps without collecting PII.
- Main still lists queued Visual QA37655528917 and Control plane authority
  promotion37655513979, both from10/08 Beijing and old SHA71027613. No active
  Producer was observed, but the old queued authority writer prevents claiming a
  completely drained writer set. No old run was rerun, canceled or deleted.
- Historical social state:28 X +45 Telegram reconcile_required. A bounded offline
  comparison against the last successful first-party Buffer snapshot found zero
  matching sent-post candidates. See social-reconciliation-candidates.json.
  Nothing was marked delivered or made retryable. No new Buffer request was made
  against its known30d denial, and OpenAI funding does not restore Buffer quota.

## Verification

Local:75 core,15 data and14 Worker tests; quality check; staging build + exact
noindex robots + no GA4 loader; production build **without** measurement env +
GA4/Clarity consent artifact checks + production SEO; YAML parsing; diff checks.
Build CI uses Node22 and runs all three suites. The earlier integration baseline
67/15 tests passed; final extra tests cover actual identified gaps, not generation
or sends. No dependency, paid service or content batch was added.

## Merge assessment

- #167 and #168 passed their latest individual CI and have no identified code
  blocker for reviewed merge. Neither activates production or closes acceptance.
- #169 requires the integration's extra operator-stop and no-unbudgeted-fallback
  review before claiming safe pre-cutover behavior. Its original CI alone is
  insufficient. Do not activate its runtime or sending switch on merge.
- The integration is a Draft review candidate. Merge would trigger existing
  Hostinger deployment and potentially the existing conditional Worker deployment;
  new GA4/Worker follow-up changes require review. No merge was performed here.

## R1 rearm proposal — deliberately not executed

1. Keep Scheduler disabled and SOCIAL_OUTBOX_SEND_ENABLED=false. Confirm positive
   API capacity still applies when recovery is actually scheduled; the single
   successful probe is historical evidence, not an unlimited allowance.
2. Merge reviewed generator fixes into canonical main after final CI. Wait for
   existing Hostinger deployment, verify current five real200+fingerprints again,
   verify new main GA4 loader/consent configuration separately, and record actual
   main/build revision. Public guide fingerprints alone do not identify layout code.
3. Reinventory active **and queued** writer jobs across Scheduler/manual Producer,
   old publishers, Outbox and authority promotion. Resolve the old queued authority
   run through the account owner before asserting drain. Do not blind-rerun it.
4. Read latest isolated receipt and its current file SHA immediately before any
   mutation. Compare exact failure cycle, history digest and closed old manifest.
   Any change invalidates this proposal; reread evidence rather than forcing CAS.
5. Only after those conditions pass, proposed patch is attempts3→1 on the isolated
   runtime branch, with expected blob SHA above. Preserve status=failure, cycleId,
   runId, times and all history. No deletion, synthetic success or main receipt.
   The actual write and subsequent Scheduler re-enable are outside this turn.
6. The next **new natural wake**, not a rerun, must admit the same failed cycle,
   skip the old closed manifest and produce exactly five distinct valid guides;
   require five200+fingerprints, monotonic Ledger closure and no duplicates.
   Keep sends disabled. Then three cycles,24h acceptance and72h cadence baseline.

Account-side remaining work: resolve the stale queued authority job; if postback
diagnostics show missing/invalid IDs or currency, inspect existing StripCash
memberId/transaction/currency macro configuration through the account UI. Do not
paste secrets or guess currency. An approved deployment and a consent-approved
real GA4 test are still needed before claiming measured sessions have recovered.
