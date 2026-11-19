# Stripcash discovery compliance — Implementation Report

**Current policy (November 20, 2026, Asia/Shanghai):** the 60-second browser/upstream cadence and 90-second maximum display validity below supersede the earlier 5/10-second acceptance snapshots. Historical test results remain labelled by their original SHA.

Date: November 19, 2026 (Asia/Shanghai). Status: IMPLEMENTED, awaiting PR validation and deployment; not DEPLOYED or MEASURED.

## Outcome and scope

Fixed the live catalog's fail-open behavior while retaining image-only discovery and approved tracked AVCams routing. No embedded player is necessary for this experience. No production deployment, merge, settings/secret change, partner conversion, outreach, social send or unrelated monetization change was performed.

Source baseline: canonical `heavenskybird/stripunion` main `d0ebbf6aa86ef5667222451b0f48d339ce34991d`, fetched before creating `codex/live-models-fail-closed`. Original checkout `304ea5c7` and pre-existing untracked `.astro/` were preserved. Read AGENTS.md, README, growth continuity/commercial principles/Growth OS, Models API and attribution documents, implementation, deployment workflow, current Issues #197–#200/#196/#188/#174/#163/#173 and their latest comments. Latest PR inventory: #209, #208, #207. Their historical success is not acceptance of this change.

## Primary-source findings

- Official Stripcash announcement confirms legacy aggregator HLS shutdown on **November 30, 2026**, superseding the original August 31 deadline. Raw HLS integrations must move to the official Stripcash Player. Source: https://t.me/s/stripcashnews .
- Official Player Guide: https://stripcash.com/documentation/player-guide?tab=player_guide%7Cplayer_guide_for_aggregators . Opened during audit, but retrieval returned zero readable lines; detailed current player embed/API requirements remain UNVERIFIED. No player code or undocumented player parameters were invented.
- Official Help Center article https://help.stripcash.com/hc/en-us/articles/30295774375196-How-do-I-get-complete-model-data-server-side still describes external HLS players. That older text must not override the explicit shutdown announcement.
- Stripcash's official channel also announces a Deleted Models API for deleted/banned/opted-out/30-day-inactive models. Endpoint/schema/access and account-specific requirements were not retrievable. This implementation does not invent or call it.

## Full repository streaming audit and file evidence

Scanned **all 11,150 tracked baseline paths**, including data, documents, automation, public files and any retained legacy files; no runtime-only exclusion. Reproducible command:

```sh
git grep -n -i -E 'm3u8|hls\.js|\bHLS\b|RTCPeerConnection|MediaSource|<video|<iframe' d0ebbf6aa86ef5667222451b0f48d339ce34991d -- .
git grep -n -i -E 'proxy|player|stream' d0ebbf6aa86ef5667222451b0f48d339ce34991d -- .
git ls-files | rg -i 'legacy|builder|player|stream|proxy|hls|m3u8'
```

The direct-streaming scan returned **zero matching lines** at baseline. The broad scan returned 37,322 matching lines, overwhelmingly editorial/analytics mentions, not executable playback. No tracked hls.js dependency, m3u8 consumer, video/iframe player, custom media proxy, deprecated player implementation or retained Builder player runtime was found. This conclusion applies to the tracked current tree, not all historical Git objects, external AVCams implementation, hosting-injected code or third-party pages.

| File / source anchor | Evidence and conclusion |
| --- | --- |
| `src/components/LiveModelsGrid.astro`, `modelCard`, `image.src` | Native `img` references the provider snapshot URL directly. No media download, rehosting, video element or embedded playback. |
| Same file, `buildTrackedUrl` | Uses centralized tracking base, userId/sourceId/targetDomain; routes to `/search/magic-search/{username}`. A discovery/search exit, not a guaranteed specific-room player. |
| `services/live-models-worker/src/index.js`, `publicModel`, `prepareCatalog` | Allowlist drops upstream `stream` and `clickUrl`, keeps only eligible public metadata and HTTPS image references; bounded top 500. |
| Same file, default `/models` handler | Cloudflare `request.cf.country/regionCode` supplies geography, not spoofable incoming `x-su-*` headers; browser Accept-Language supplies language. Responses filter per visitor before dropping geobans. |
| `src/pages/avcams.astro:38` | LiveModelsGrid placement; existing generic viewer and creator referral flows remain intact. |
| `src/pages/index.astro:40`, `best-live-cam-sites.astro:46`, `best-free-live-cam-sites.astro:23`, `stripchat-pricing.astro:33`, `stripchat-alternatives.astro:75` | Other shared-component consumers receive the same fix. |
| `src/layouts/BaseLayout.astro:450` onward | Delegated click handling supports dynamically created cards, attaches p3/memberId, respects measurement consent and isolates staging attribution. |
| `src/config/site.js`, `src/lib/affiliate.js`, `AffiliateButton.astro` | Existing centralized commercial configuration and fallback CTAs; no account/destination/referral change. |
| `ops/seo-data-layer/src/collectors/stripcash-models-schema-probe.mjs` | Schema-only upstream probe; does not persist previews/streams. Independent manual caller is a rate-limit coordination caveat. |
| `services/live-models-worker/wrangler.toml` | Single global CATALOG Durable Object binding; no streaming service or media storage added. |
| `.github/workflows/deploy-live-models-worker.yml` | Existing gated deployment and public smoke; no settings changed. |

## Defects and corrections

1. **Worker stale fallback:** failed refresh previously returned `existingCatalog` with `stale:true`; recent failed attempts could keep returning it during cooldown, without an expiry-based rejection. Now failed HTTP/network/timeout/JSON/schema refreshes delete catalog/fetchedAt and return 503. Cooldown never returns an expired catalog. A successful empty feed replaces previous inventory.
2. **Frontend indefinite cards:** one fetch rendered whatever models it received, ignored `ok/stale/refreshedAt`, and never revalidated or removed cards. Now it polls while visible, requires successful fresh metadata and public HTTPS-image cards, and expires cards at the original 10-second deadline. Failed fetches, offline events and tab hiding clear cards and reveal the tracked generic fallback. A delayed response cannot repopulate a hidden/offline page.
3. **Unverifiable restrictions:** missing/malformed geobans can no longer become an unrestricted model. Country/region comparisons normalize case; unknown relevant country/region/language hides restricted models. Wildcard language is treated as unverifiable for language-restricted models.
4. **Caching:** model success and failure responses explicitly use `no-store`; frontend fetches also bypass browser caching. Other attribution endpoint cache behavior is preserved.
5. **Concurrency:** requests join the active global refresh. Upstream fetch has an 8-second timeout, with attempts separated by at least 10 seconds, stricter than the documented 5-second limit.

This is bounded snapshot verification, not an instantaneous online guarantee. A model can change status within the 10-second eligibility window. Client clock skew may hide cards conservatively. The fallback provides an approved revenue exit without pretending stale models are live.

## Compliance matrix

| Requirement | Result / limitation |
| --- | --- |
| Legacy HLS shutdown | Current StripUnion tree has no playback to migrate. Keep image-only; if future playback is approved, use the current official Stripcash Player after reviewing the actual guide and testing restrictions/tracking. |
| blockedCountries | Case-normalized denial; unknown country hides geographically restricted models. |
| blockedRegions | Country-key and region comparisons normalized; missing region hides models restricted in that country. |
| blockedLanguages | Regional Accept-Language tags also check primary codes; missing/wildcard language hides language-restricted models. Actual viewer-language correctness remains limited to the browser header. |
| API rate limit | One global DO, minimum 10 seconds, single-flight and persisted attempt timestamp. The existing manual schema probe is independent: do not run concurrently until the provider's per-key/domain rate-limit scope is confirmed. No live upstream API tests were run here. |
| Model removal | Missing/non-public models leave the catalog on successful replacement; failure erases inventory; idle catalog storage alarm deletes after 24h, within the documented 30-day requirement. No persistent profiles or preview archive. Deleted Models API-specific obligations still require confirmation. |
| Preview images | Direct upstream HTTPS `img` sources only; no download/proxy/rehost. Synthetic tests use example.invalid fixtures. |
| Affiliate tracking | userId/campaignId/creativeId/sourceId/p1/p2/targetDomain/path preserved; delegated handler attaches p3/memberId. Existing consent/staging behavior, model referral and affiliate referral destinations preserved. Partner credit and USD earnings not measured. |

## Modified files

- `services/live-models-worker/src/index.js`: failure handling, validation, freshness, timeout and single-flight.
- `src/components/LiveModelsGrid.astro`: freshness validation, revalidation, expiry and removal/fallback behavior.
- `services/live-models-worker/test/catalog-lifecycle.test.mjs`: failures, persistence, cooldown, concurrency, removal, geobans and retention regressions.
- `services/live-models-worker/test/live-grid.test.mjs`: executes the actual inline script in a controlled DOM fixture; stale rejection, card removal and tracked routing.
- `scripts/test-live-models-browser.mjs`: reproducible Chromium test against built HTML with synthetic responses, including dynamic click tracking.
- `.github/workflows/deploy-live-models-worker.yml`: strengthens existing deployment smoke to require no-store, fresh non-stale timestamps and public HTTPS-image cards; a valid empty eligible catalog is accepted. No deployment gate/settings change.
- `docs/STRIPCASH_MODELS_API.md`: current architecture, lifecycle, caveats and test instructions.
- This report.

## Validation results

| Check | Result |
| --- | --- |
| `npm test --prefix services/live-models-worker` | PASS, 26 tests, including existing attribution tests. Already covered by existing Build workflow. |
| `node --test scripts/test/*.test.mjs` | PASS, 207 tests. |
| `npm run check` | PASS. |
| `ASTRO_TELEMETRY_DISABLED=1 PUBLIC_ALLOW_INDEXING=true npm run build` | PASS. |
| `npm run check:prod-seo` | PASS after successful production-indexable build. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node scripts/test-live-models-browser.mjs` | PASS: renders fresh cards, dynamic click preserves p3/memberId and commercial parameters, no video/iframe, seven responsive widths, failed refresh clears cards and exposes fallback. All requests intercepted; no production visit or provider event. |
| Existing `scripts/test-affiliate-consent-browser.mjs` | PASS for deny/grant/revoke, unreadable storage and staging. All requests local/intercepted. |
| Existing `scripts/visual-regression.mjs` | PASS, 14 pages/screenshots, zero warnings/failures: AVCams and Best Live Cams at 320/360/375/390/412/768/1440px. Temporary wrapper selects installed Chromium, serves actual dist assets and intercepts external requests with unavailable responses. This exercises the fallback, not live inventory or production. Full-page images and JSON retained under local `work/visual-qa/`; not committed. |
| `git diff --check` | PASS. |

Initial local build failed because Astro telemetry attempted an unavailable home configuration directory. Disabling telemetry resolved it without changing application code. The initial SEO check used the old staging artifact and failed; the check passed after the successful indexable rebuild. Local runtime is Node 24.19.0; repository CI uses Node 22, which remains the exact-head release gate.

## Real production observations — separate from local acceptance

- Latest read-only Ecosystem public health run inspected: https://github.com/heavenskybird/stripunion/actions/runs/44528938781 . Source SHA **304ea5c77a1e92834af38d5906ee1c2dbf998af3**; oracle job **135576836632**, November 19 at **20:59:10 Asia/Shanghai** (12:59:10 UTC). Decoded logs explicitly report `PASS main`, `PASS blog`, `PASS avcams`, with AVCams warning `sitemap_not_observed`. This is production endpoint evidence from GitHub infrastructure, not proof of the currently served code SHA or player behavior.
- Oracle artifact **14530929352**, ZIP digest **1a5a7e12e74100eff40228b5c77c0b4167055a177aa26ad99bd773f454e91447**; metadata/log evidence inspected, binary artifact not downloaded. https://github.com/heavenskybird/stripunion/actions/runs/44528938781/artifacts/14530929352 .
- Latest observed historical push Build **43679597264**, source **165bb13f13cd3839bc4f65220f4a22a5a22ea7fa**, passed November 15. It does not validate this branch.
- Chat web retrieval of https://stripunion.com/avcams redirected to `/avcams/` and exposed current Live Now copy, generic AVCams exits and official model-signup referral copy. It did not execute JavaScript or prove live cards/network/player behavior.
- Direct environment GETs to Main, Blog, AVCams, Worker health/models and Player Guide failed at the network tunnel with 403. Classification **WEB_FETCH_LIMITATION**, not demonstrated PRODUCTION_FAILURE. GitHub CLI API calls were Forbidden; authenticated GitHub connector reads worked.
- Browser skill was inspected; no connected browser-control tool was available. Live production browser behavior, Worker response freshness, deployed Worker version and exact main-site production SHA remain UNVERIFIED. Chromium evidence above is local built-artifact testing only.

## Release gate and owner-only actions

1. Keep PR unmerged until exact-head Build/required checks pass on Node 22 and a reviewer accepts the restrictions/schema behavior. Do not modify production settings as a shortcut.
2. Confirm current authenticated Player Guide and Models API schema, including geoban field types, rate-limit scope and Deleted Models requirements. Owner supplies account access/export or asks the partner manager; never paste API secrets into chat. No owner action is needed to add a player to the current discovery design.
3. After authorized deployment, verify actual Worker version and site build, `/models` no-store/freshness/503 behavior, real browser revalidation/offline/hidden-tab behavior, regional/language restrictions, direct image hosts and preserved affiliate routing. Preserve existing deploy toggle/secrets; do not dispatch production writes solely to obtain evidence.
4. Real partner credit, model/affiliate referral commissions and incremental confirmed USD revenue require scoped provider evidence and existing #174 reconciliation. This repair's business value is preventing unavailable/non-permitted discovery inventory while preserving qualified conversion routes; no uplift or payout is claimed.

Next autonomous action is exact-head PR check inspection and review of any failures. No merge or production change is authorized by this report.

## Remaining-acceptance review of e1a013558bb773e01437daac36533d3ea43e1ea9

Reviewed the exact requested head; GitHub confirmed both Build runs 44546010033/44545993142 and Visual QA 44546009985 passed. Those completed checks were not rerun merely for acceptance.

**Demonstrated defect:** fixed 5-second polling can straddle a 10-second Worker cache deadline. With a 200 ms upstream delay and 80 ms Worker-to-browser delay, the initial snapshot was still fresh at the 10-second poll; it expired just afterward and the browser waited until the 15-second poll. A Chromium run executing the exact inline script against the actual `ModelsCatalog` class measured a **5,056 ms empty-card interval** despite healthy synthetic upstream responses. Therefore the original requested SHA was not ready for merge on timing acceptance.

**Focused correction:** the expiry callback still removes expired cards immediately, then requests revalidation immediately. No Worker interval/freshness change, stale-data grace period, player, Deleted Models integration or infrastructure change. The matching 22-second Chromium run measured two renewal gaps of **288 ms and 287 ms**, consistent with the configured request latency, instead of waiting another polling cycle. There were three upstream fetches over the run, at least ten seconds apart. This removes the demonstrated multi-second scheduling stall; it does not promise zero flicker. A brief fail-closed absence at a freshness boundary, or a longer absence under a slow/unavailable upstream, remains intentional. Production latency and resulting visual acceptability cannot be established from this environment.

A new deterministic regression executes the actual inline script with a cached-snapshot fixture: polls just before expiry reuse the first snapshot; expiry must remove cards and immediately request/repopulate a new snapshot without waiting five seconds. Existing failure/offline/hidden-tab removal tests remain in the focused suite.

**Production access:** direct read-only `/health` and `/models?limit=3` requests with approved Origin and Accept-Language headers failed with tunnel HTTP 403; chat web retrieval also could not access those endpoints. This is WEB_FETCH_LIMITATION, not a demonstrated production outage. No real Worker HTTP payload, live model eligibility, upstream status distribution or live network timings were obtained. Synthetic fixtures use an unrestricted public model; they are not evidence of any real model's eligibility.

**Affiliate preservation:** comparison against canonical pre-PR main and the reviewed head shows no changes to `src/config/site.js`, `src/lib/affiliate.js`, `AffiliateButton.astro`, `BaseLayout.astro`, `avcams.astro` or `become-a-cam-model.astro`. The LiveModelsGrid tracking builder/card code is unchanged by this acceptance fix. Viewer targetDomain/path and userId/campaignId/creativeId/sourceId/p1/p2 remain intact; existing delegated click-time p3/memberId and official model-referral routing are untouched. No partner click, signup, conversion or production setting was submitted during acceptance.

Only the demonstrated scheduling defect, its focused test and this evidence addendum were changed. The previous completed broad test/visual results remain historical evidence for the original head; the new head requires its own CI gate. No merge or deployment was performed.

Targeted validation after the correction: all 27 Worker/frontend tests passed; the new timing regression failed against the original exact-head script (expected red) and passed with the fix. Quality check, production-indexable build and production SEO check passed after the code change. No unchanged project/data-layer/visual suites were manually repeated.


## Editorial-cost optimization — November 20, 2026

Business scope is editorial SEO and affiliate referrals, not real-time streaming.
Continued existing draft PR #211 from GitHub-confirmed head `d70d0f7c82ecf86c1f6439032853f7da70153019` without merging or changing production settings.

- Browser revalidation: **60 seconds after each completed request**, only when the component intersects the viewport and the page is focused, visible and online. Initial offscreen components make no inventory request. Pending requests are aborted on suspension and late responses cannot restore cards.
- Worker: **60-second minimum upstream interval**, still enforced by the existing single global Durable Object and persisted attempt timestamp. A separate constant sets **90-second maximum display validity**; this is not permission to serve a failed refresh. If a shared snapshot is already old when a visitor arrives, expiry can initiate one necessary early renewal instead of waiting for the next regular poll. A synthetic 59-second-old shared snapshot renewed with only its 280 ms response delay, not a multi-second polling gap.
- Failure: unsuccessful HTTP/network/JSON/schema revalidation immediately removes inventory, including cards otherwise within their 90-second deadline. Expired/offline/non-public inventory remains hidden. The original server deadline is never extended by reading the same cached catalog.
- Healthy renewals: retain the identical card/image DOM when inventory is unchanged. Completion-based scheduling plus the 30-second eligibility margin prevents the prior polling-boundary gap under the synthetic healthy-delay scenarios tested. No guarantee of uninterrupted real-time availability is made.
- Analytics: emit loaded/unavailable only on availability transitions, not every poll, repeated failure, viewport callback or cached response.
- Existing geobans, direct upstream image URLs, API credentials/configuration, affiliate destinations and viewer/model referral routes remain unchanged. No player, new API/database/workflow/service or infrastructure was introduced.

Focused files changed in this optimization: `src/components/LiveModelsGrid.astro`, `services/live-models-worker/src/index.js`, existing `test/live-grid.test.mjs` and `test/catalog-lifecycle.test.mjs` under that Worker, `scripts/test-live-models-browser.mjs`, the existing timing-marker guard in `scripts/quality-check.mjs`, the existing deployment smoke in `.github/workflows/deploy-live-models-worker.yml`, `docs/STRIPCASH_MODELS_API.md`, and this report.

Synthetic validation:

- **33 Worker/frontend tests passed**, including 60-second cache reuse/rate-limit/cooldown, 90-second deadline, healthy delayed renewals with no empty-card transition, unchanged card identity, immediate failed-refresh removal, no offscreen/hidden/unfocused/offline polling, aborted-response suppression, deduplicated analytics and existing attribution/geoban regressions.
- Updated existing Chromium test against actual built HTML passed with a virtual clock: no request before viewport entry, no poll at 59,999 ms, one healthy renewal at 60 seconds with the same card DOM, one loaded event, preserved click-time affiliate parameters, responsive overflow checks and failed revalidation removal. Requests were intercepted locally; no production/partner event was sent. Virtual-clock evidence is not production wall-clock/network measurement.
- Quality check, production-indexable build and production SEO check passed locally. Deployment workflow YAML/shell and extracted 90-second smoke contract are checked locally. Exact new-head GitHub Build and Visual QA are required and linked in the PR delivery record; the old head's green checks do not validate this optimization.

Official-rule boundary: the repository records a maximum frequency of one API request per five seconds, not a required five-second polling cadence. Official API documentation was opened again at https://stripcash.com/documentation/api/?tab=models_api_for_aggregators but returned no readable content. The accessible official Help Center explains online inventory/privacy metadata but does not establish a maximum allowed cache age. No evidence retrieved proves the requested 60/90 policy unsuitable; authenticated partner-specific requirements remain unverified, rather than being represented as confirmed approval. No integration expansion is warranted on that basis.

Production boundary: this branch remains undeployed. No actual production behavior or partner credit is established by these synthetic tests or by PR CI. The earlier Worker-access limitation remains; current live payload eligibility, production latency and authenticated maximum-age obligations require post-deployment/account evidence. No production settings, credentials or approved commercial routes were changed.


Initial optimization commit `9f3739ea1411777f2a5d5b00c4aba7c4481b55eb` failed PR Build 44566827190 because the existing migration quality gate still hard-coded `MIN_UPSTREAM_INTERVAL_MS = 10_000`. The initial local quality invocation also failed with that marker; it must not be counted as a pass. The guard now explicitly requires `MIN_UPSTREAM_INTERVAL_MS = 60_000` and `CATALOG_VALIDITY_MS = 90_000`, preserving timing validation under the new policy. Delivery checks must refer to the corrected new head.
