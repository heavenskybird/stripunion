# StripUnion reliability, mobile and growth audit — 2026-10-29

Status: proposed repair; **no merge, deployment, production configuration change, credential change, database write, social send or WordPress write was performed in this audit**. Draft PR #164 was read as metadata only and was not modified. All times below are UTC unless explicitly marked Beijing (UTC+8).

## Fresh bootstrap and current state

- Canonical repository: `heavenskybird/stripunion`, default branch `main`.
- Audited main: `2b60d16188a61bba3485eb1ad61f5ca2ce803a55`, tree `b3b0da2abcdab163d11c239fd754ef44083037e5`, committed 2026-10-29 14:09:16 UTC / 22:09:16 Beijing.
- Supplied checkout was `work` at `08ddf1ef…`; its `origin/main` was stale at `7cb0c1ab…`. Its untracked `.astro/` was preserved. Work is isolated in `/workspace/work/stripunion`.
- Initial Git transport failed because sandbox socket access could not reach the configured proxy. Canonical files were fetched with the GitHub connector and the reconstructed **entire tree hash matched canonical main**. A subsequent ordinary Git fetch with supported socket permission succeeded. The final feature branch is based on the real canonical commit, not the reconstructed checkpoint.
- Only open PR returned by the fresh inventory: [Draft #164](https://github.com/heavenskybird/stripunion/pull/164), head `68e0087…`, offline Keyword Intelligence V0. No cherry-pick or modification.
- Node 22.23.4; Astro 7.3; canonical local build: 1,434 pages. README's historical staging status is stale and was not used to infer production state.
- Environment reported enforced restricted networking, no configured secrets/runtime credentials/outbound identities. Production `stripunion.com` requests were denied at the network proxy (CONNECT 403). This is an environment observation limit, not evidence of a site outage. No attempt bypassed the proxy or destination policy.
- Canonical main contained 26 workflow definitions. [workflow-inventory.json](workflow-inventory.json) records names, triggers, permissions and concurrency **before this patch**. Read-only collectors and production publishers are distinguished from social senders below.

## Runtime evidence

| Surface | Evidence | Finding |
| --- | --- | --- |
| Native outbox | [run 40888546283](https://github.com/heavenskybird/stripunion/actions/runs/40888546283), 14:08:33 UTC / 22:08:33 Beijing | Success: 4 Telegram deliveries, 1 X scheduled, 8 ready left; Buffer matched 5, unmatched 28. Logged daily usage X 16/20, Telegram 86/100. |
| Producer | [run 40887202477](https://github.com/heavenskybird/stripunion/actions/runs/40887202477) and isolated R1 receipt | Receipt cycle/run 40887202477, attempts 1, success, finished 14:08:35 UTC. This is receipt evidence; no new publication claim was inferred from a green scheduler alone. |
| Public health | [run 40853236944](https://github.com/heavenskybird/stripunion/actions/runs/40853236944) | 09:54 UTC: machine-readable oracle passed Main, Blog and AVCams; AVCams sitemap not observed. |
| Production visual | [run 40836902883](https://github.com/heavenskybird/stripunion/actions/runs/40836902883) | 07:40 UTC: 35 HTTP 403 failures on Main/Blog. These responses prevented layout verification; a later health pass does not erase that incident. |
| SEO collectors | [run 40834026291](https://github.com/heavenskybird/stripunion/actions/runs/40834026291) | Source steps succeeded. Saved snapshots are dated by source, not represented as live values. |
| Recent failed Producer | [run 40826513177](https://github.com/heavenskybird/stripunion/actions/runs/40826513177) | Five URLs and deployment probe returned transport errors through the bounded verification deadline; Dead Letter recorded. |

## P1 — schedule gaps and single-writer wakeup

The 100-run repository sample contained 23 Native outbox runs: 19 `workflow_dispatch`, only 4 scheduled. Scheduled runs appeared at 2026-10-28 19:53:20, 23:43:45 and 2026-10-29 02:54:31, 09:07:12 UTC. The largest consecutive scheduled gap in this sample was **6h 12m 41s**, despite the intact `*/15 * * * *` definition. Dispatches often filled the gap at roughly hourly publication cadence. The evidence establishes missing/delayed scheduled executions, not a proven internal GitHub scheduler cause. The cron expression itself is not malformed.

Additional code defects:

1. Exceptions after a provider request became `retryable`, even when provider acceptance was unknown. A timeout, runner death or failed main-state persistence could therefore replay a successful send.
2. Telegram's photo exception fell back to a second irreversible text send, including ambiguous timeout cases.
3. Buffer posts without `dueAt` were labeled delivered without explicit sent status.
4. Buffer matching selected the first slug match even when multiple posts matched; untrusted hostnames could contribute matching slugs.
5. Local receipts did not account for provider-side posts from other paths. Five legacy workflows also sent outside the outbox, so outbox-only counters were not channel-wide protection.
6. Invalid/unbounded environment values could weaken batch/cadence limits.

Implemented repair:

- `social-outbox-heartbeat.yml` consumes trusted completed Producer bridge / social bridge / health / snapshot signals, or an explicit manual invocation. It checks canonical repository/branch/event provenance, active original outbox runs, a 30-minute freshness threshold and repeated failures. It dispatches **only the existing** `social-outbox.yml`.
- `social-outbox-heartbeat-bridge.yml` provides a signal-only, non-main push surface on `bot/stripunion-social-heartbeat-kicks`; it accepts only the existing social-kick file path. No provider secrets or delivery code are in the bridge.
- Both wakeup and sender share `native-social-outbox`, `cancel-in-progress:false`. A CAS-protected wake receipt adds a 30-minute cooldown across duplicate signals and dispatch visibility lag. A fresh run is required; historical reruns are rejected.
- The original outbox cron, sync/reconcile/deliver/report/persist sequence and concurrency remain. Its environment now passes the normal workflow token for the journal and the explicit cutover flag. Changes followed passing initial safety tests.
- Before a provider mutation, a contents-API CAS claim is persisted on isolated `codex/social-outbox-runtime`. A failed claim cannot send. A runner crash or uncertain result leaves a durable `reconcile_required` record. Confirmed provider message IDs/status are persisted before local completion. A failed final journal write stops the batch. Legacy attempted events without a durable receipt are held, not blindly retried.
- Buffer reconciliation must be fresh and fully paginated; truncation or unknown provider dates fail closed. Matches require approved article hosts, and ambiguous matches stay unresolved. Actual sent/scheduled provider IDs and local receipt IDs are unioned for due-day admission. X uses an explicit ten-minute-ahead scheduled slot so its day can be checked before creation; a real provider response is still required. Acceptance also counts attempts conservatively.
- X maximum 20/day, minimum 45 minutes between attempts; Telegram maximum 100/day; batch maximum 5. Lower configured caps are supported; invalid or raised limits fail closed. Unknown attempts reserve budget. Provider-side Telegram historical listing is unavailable in the existing Bot API adapter: uncertain sends remain held for independent confirmation.
- `SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED=true` enables the repaired native sender **and excludes all five legacy jobs**. The legacy jobs share the same lock. Dormant bootstrap/backfill jobs additionally require an explicit replay flag, avoiding accidental historical posts when workflow/adapter files change. This cutover intentionally retires direct evergreen/manual delivery; any replacement content must be admitted through the outbox, not replayed.
- The heartbeat has a separate enable flag, default off. No flag, runtime branch or external automation was activated during this audit.

Important limits: 30 minutes is the admission threshold, **not a guaranteed recovery SLA**. Existing Producer Heartbeat runs hourly; absent another trusted tick, detection may wait for that run. GitHub-hosted bridge execution can also be delayed. For a tighter fallback, the existing sole recovery owner can update the social signal branch from an authorized external timer at the supported frequency. Do not add a competing autonomous sender. Manual posts outside repository control cannot be constrained by this code; preserve one channel owner during acceptance.

## P2 — all outstanding Dead Letters

Read-only Supabase inspection returned **30 unresolved rows**. Every row's linked failed GitHub job and retained logs were inspected. [dead-letter-triage.json](dead-letter-triage.json) contains one result per row with the failed stage, cause, current ledger corroboration and resolution status.

| Cause from retained evidence | Rows |
| --- | ---: |
| Historical Buffer free queue limit (10 scheduled posts), while publication/distribution were coupled | 9 |
| URLs not deployed / stale deployment fingerprint within deadline | 8 |
| Generator rejected duplicate or invalid five-item batch | 6 |
| Transport errors / unavailable deployment probe | 3 |
| Access denied during live verification | 2 |
| Unsupported privacy guarantee rejected by compiler | 1 |
| Older publication/distribution verification requiring fuller evidence | 1 |

There are 70 current ledger records for URLs recovered from these logs, covering 14 failed batches. These later records support recovery investigation; they do not prove that the original failed attempt completed, and some older Buffer failures did not log a complete five-URL manifest. None of the 30 rows was marked resolved without a cycle-bound evidence chain. Existing generation/claim guards were preserved, not weakened to make failures green. Future Dead Letter payloads now include `R1_CYCLE_ID` so recovery can bind to the exact cycle rather than an ambiguous run number.

“Historical cycle 114” could not be uniquely linked to a Dead Letter. No Dead Letter ID/payload or content-job ID matched 114. The identifiable Scheduler **run number 114**, [38146596585](https://github.com/heavenskybird/stripunion/actions/runs/38146596585), was a successful **admission skip**, logged `backoff`, remaining 2,108,862ms, on October 11. It did not publish five articles. Other workflows also have a run number 114. An exact original cycle/run ID is needed before assigning that label to a failure; no receipt was edited to force a match.

Outstanding resolution procedure: bind each failed cycle to its immutable five-item manifest and expected content hashes; perform read-only HTTP/fingerprint checks from an authorized production observer; confirm subsequent genuine publication closure; reconcile each social provider independently. Only then conditionally resolve the matching Dead Letter with evidence references while preserving the original failure. Never rerun historical Producer jobs, reset receipts, fabricate `published_at`, or create ledger entries from build output alone.

## P3 — mobile overflow

- The canonical six-page baseline passed 42 local page/viewport checks, including 320px, with no overflow. The exact historical 94px/30px/15px warning reports were not found in the retained Supabase visual records, so their original page-specific causes are not claimed as reproduced.
- Expanded high-intent coverage **did reproduce a 41px document overflow at 320px on `/adultfriendfinder`**. Browser evidence showed `.discovery-hero-copy` at left 28px, right 361px, width 333px. The mobile grid used an automatic-minimum `1fr` track, and the long title imposed a minimum content width.
- Fix: mobile discovery track `minmax(0,1fr)` plus `.discovery-hero-copy {min-width:0; overflow-wrap:anywhere}`. No clipping or hidden body overflow was used to conceal the problem.
- The prior visual oracle downgraded document overflow to a warning when it could not find a visible descendant offender. This is now a failure regardless of attribution.
- A browser regression creates exact **94px, 30px and 15px** root-geometry fixtures without a visible descendant offender; all fail the corrected gate. These are synthetic regression reproductions, not claims about the original historical pages.
- Final coverage: 10 pages × 320/360/375/390/412/768/1440 = **70 checks, zero failures, zero warnings**, with full-page screenshots and JSON evidence. Added pages include `/stripchat-alternatives`, `/adultfriendfinder`, `/become-a-cam-model`, `/avcams`. Browser requests outside the local build were blocked during layout tests.

## P4 — SEO, quality and attribution priorities

Production-indexable local build and production SEO checks pass. A separate staging build retained exact deny-all robots. This proves generated artifacts, not current Google indexing or live edge behavior.

| Priority | Evidence | Recommended next improvement / acceptance |
| --- | --- | --- |
| 1: access and indexing reliability | Production visual 403 incident; later public oracle pass. Bing snapshot reported 35 Main indexed pages and 4 Blog pages; this is **Bing's count**, not a Google coverage ratio. | Investigate edge/Hostinger denial and deployment propagation with timestamps and request IDs; inspect a bounded GSC URL sample. Require intended URLs HTTP 200, canonical match, indexable HTML and discoverable sitemap. Do not weaken access/security rules without review. |
| 2: measurement reconciliation | Saved GA4 Oct 28: 2 sessions, 0 engaged, 0 affiliate clicks; first-party snapshot: 14 clicks, 12 postbacks, 1 matched, 11 unmatched; 222.06 revenue in UNKNOWN currency. Blog GA4 acceptance CONNECTED, one main web stream. | Run consent-aware Main→Blog→affiliate test journeys in the existing property and compare source/medium, landing host, member-ID join and timestamps. Do not equate provider aggregate revenue with attributable page revenue; fix currency at its real source. No identifier/consent-policy change was made. |
| 3: title/intent collisions | 1,345 guides: **13 exact-title groups**, **94 high-overlap title pairs**, **0 exact body duplicates**. [quality-audit.json](quality-audit.json) lists candidates. | Review the 13 title groups first against 7/14/30-day query→page evidence; choose retain/distinguish/consolidate per intent. Title similarity is triage, not proof of duplicated substance. No mass rewrite, redirect or noindex action. |
| 4: existing commercial landing pages | Saved report: Stripchat alternatives 40 clustered impressions / best position 3; AdultFriendFinder review 38 / 16; become-a-cam-model 30 / 1.5; Stripchat review 48 / 4; Chaturbate review 19 / 3. Small samples. | First fix the reproduced AdultFriendFinder mobile defect (done locally), then improve answer specificity/internal links on existing pages with bounded experiments. Track qualified visits/CTA clicks over 7/14/30 days. Preserve approved affiliate routing and separate viewer/model/webmaster intents. |
| 5: social acquisition attribution | Native Telegram passed bare article URLs while X added UTMs. | Native Telegram now uses `utm_source=telegram`, `utm_medium=social`, `utm_campaign=social_outbox`, stable article `utm_content`. Article destination unchanged. Verify next accepted Telegram click in the existing GA4 property after consent. |

The saved report has domain-query totals (31 clicks/1,427 impressions) that differ from page-row aggregates (Main 32/1,661 plus Blog rows). Do not sum differently grouped Search Console tables or treat those as interchangeable site totals. Collector dates vary: GSC Oct 27, most other sources Oct 28, Clarity/Admin Oct 29. Only first-party/official/free repository evidence was used; no GSC Wizard, Ahrefs, Semrush or paid tool was called.

## P5 — live-room preview failure

Confirmed architecture: the browser requests Worker `/models`; Worker filters public models by geography/language and serves snapshot URLs. Affiliate navigation remains the centralized StripCash→AVCams flow. This component is a snapshot-card discovery surface, not a video-stream player.

Retained [Worker deploy run 37302962225](https://github.com/heavenskybird/stripunion/actions/runs/37302962225), October 5, deployed successfully and logged health PASS, three eligible models for both approved origins, and unapproved-origin rejection PASS. It failed **after those checks**, during attribution smoke checks. That historic deployment failure is not proof that `/models` failed. Current upstream/edge/CORS/image response evidence is unavailable from this task's production network policy, and no connected browser or Cloudflare log tool was available. **The current live preview root cause remains unconfirmed.**

An observed diagnostic defect was repaired: the client collapsed HTTP failure, empty catalog and transport/CORS/payload failure into one uninformative fallback. Existing analytics now record safe HTTP status and a bounded stage label; empty catalog is separate. No token, model identity or upstream URL is logged. Browser tests mock HTTP 503 and HTTP 200 empty inventory and verify the affiliate fallback still targets `avcams.online`.

Minimum user/authorized operator action: capture one `/models?limit=1` response from an approved StripUnion origin plus CORS headers/request ID and matching Worker diagnostic. If HTTP 200 with empty list, inspect expected geo/language filtering; if 503, correlate `upstream_http_*`, configuration or cooldown diagnostics; if catalog succeeds but images fail, inspect the original CDN response without downloading/rehosting snapshots. Do not rotate credentials or change affiliate destinations as a speculative fix.

## Validation and acceptance plan

Local validation: Node 22.23.4, 52/52 core reliability/generator/outbox/workflow-contract tests, 14/14 SEO tests, 12/12 Worker tests; browser overflow regression 1/1 (21 fixture cases); mocked live-preview regression 1/1 (2 scenarios); final visual 70/70; quality check; staging build/robots; production-indexable build/SEO; actionlint across all workflows; JavaScript syntax/self-tests; diff whitespace and protected-path checks. No lint script exists in package.json; actionlint, syntax checks and repository quality gate provide the applicable lint coverage. No provider mutation occurred in tests.

Deployment acceptance is **not authorized by this report**. Keep this patch Draft until the following concrete checks pass:

1. Review the single-writer cutover and custom Buffer scheduling. Provision `codex/social-outbox-runtime` and `bot/stripunion-social-heartbeat-kicks` from approved main without any main kick. Confirm branch protections allow only intended runtime writers; do not weaken protections to make a test pass.
2. During an approved maintenance/canary window, stop new social sends via the existing send-disable variable, let all legacy/native writers finish, inventory real provider deliveries and uncertain events. Do not discard debt. The new sender fails closed until single-writer cutover is accepted. Ensure legacy replay flag is false before any merge (the patch also defaults historical replay off).
3. Separately approve merge/deployment. Set the coordinated single-writer flag only after all guards are deployed. This disables legacy direct routes; plan explicitly for any evergreen content that should later enter the canonical outbox. Keep heartbeat off and sender disabled for initial admission tests.
4. Prove duplicate trusted wakeups, queued/running native sender, fresh <30-minute state, stale ≥30-minute state, repeated-failure block and CAS conflict. Verify one fresh original outbox run, no main metadata kick and no Hostinger deployment caused by a wake receipt. A wake is not proof of delivery.
5. Enable a controlled sender canary with existing secrets. Observe a real Buffer scheduled receipt at the requested slot and its later provider sent confirmation, plus one real Telegram message ID. Confirm daily counters include provider history, X ≥45-minute spacing and no legacy writer. Simulate a failure after claim using test fixtures, not production receipt edits.
6. Enable heartbeat only after those checks. Existing Producer Heartbeat remains sole external recovery owner; update its authorized prompt only after deployed workflow/branch verification. It may SHA-guard update **only** `ops/control-plane/social-outbox-kick.json` on the social bot branch, respect ≥15-minute kick spacing, inspect current native runs/journal first, and never use a main kick or historical rerun. Current hourly automation frequency is not a 30-minute SLA.
7. Recheck the 70-case visual matrix on the actual deployment, all intended canonical/robots/sitemap surfaces, consent-aware GA4 source attribution, provider caps/receipts and preview diagnostics. Resolve Dead Letters only from the cycle-bound evidence described above. Review WordPress legal/consent documents manually; this task did not edit them.
8. Rollback by disabling heartbeat and native sends, preserving the isolated attempt journal and all reconcile-required events. Do not blindly roll back to an older retrying sender or reenable legacy paths while native writers are active. Roll back site layout independently if needed.

Remaining acceptance blockers: live cycle-bound Dead Letter proof (including unambiguous “114”), current preview response/log evidence, production edge 403 diagnosis, authenticated draft delivery outcome, and approved runtime-branch/flag cutover. No production success is inferred from local tests.
