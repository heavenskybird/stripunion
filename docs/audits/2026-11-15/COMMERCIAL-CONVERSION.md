# Commercial conversion: verified baseline and bounded next pilot

## Actual production acceptance

Read-only hosted run **43671270663** at 2026-11-15 03:12:37 UTC verified all three #202 guide URLs: real HTTP200, self-canonical trailing slash, article-scope StripCash referral CTA, `rel=sponsored`, Paid referral/no guaranteed earnings disclosure and exact previously approved `https://stripcash.com/sign-up/stripunion`. Official signup landing responded200; no form, signup, purchase or receiver event was generated. `production-pilot.json` records separate served article and CTA-contract SHA256s. The audit source SHA is not falsely called the provider's deployed Git SHA.

- adult-affiliate-webmaster-program-evaluation-guide
- adult-affiliate-program-business-model-structure-comparison
- adult-affiliate-program-application-readiness

Attribution acceptance is **configuration, not revenue**: existing consent-safe `affiliate_click` includes `affiliate_partner=stripcash_referral` and unique `affiliate_source=guide_webmaster_<slug>`. The provider referral URL identifies StripUnion's referrer, but no official per-page referral SubID support or actual referred registration/earnings receipt has been proved. Do not append invented tracking parameters or assign provider totals to these pages. No synthetic conversion or test receiver POST was sent.

## Current rendered audit and next reversible change

Latest source baseline 98f56610 builds **1765 guides**, of which **3** have article-scope contextual paid exits; this is later than the earlier1730 baseline, due to natural R1 publishing. The extended #201 audit supports `--details`; `commercial-coverage-priority.mjs` combines rendered rows with current7/current28 official Domain GSC query/page cells, preserving exact observed host variants, source-as-of and aggregation. Top20 missing exits are in the artifact, not inferred from source-template presence.

GSC snapshot collected2026-11-14T16:39:11Z; current28 Oct16–Nov12 and current7 Nov6–Nov12 (Google Pacific dates). Two reviewed viewer-intent candidates:

| Existing guide | Observed current28 impressions | Relevance / approved product |
| --- | ---: | --- |
| live-cam-platform-model-fit-comparison |169| Viewer marketplace/network comparison; approved AVCams viewer browsing, not creator employment |
| live-cam-private-interaction-visibility-choice |8| Public/private room choice; optional AVCams room comparison, no anonymity or safety promise |

These are observed query×page cells, not GSC property totals, market volume or proven growth. The second candidate is small-sample commercial fit, not a claimed high-volume winner. `guide-commercial-policy.mjs` allows only these two viewer guides plus the three existing webmaster guides; category match is also required. No game, anime, shop, dating or neutral privacy page receives a cam CTA. Compiled coverage becomes **5/1765** only in the candidate build until production verification passes. Rollback: remove the two viewer slugs (or revert this PR); existing three webmaster CTAs remain separately defined.

A main-branch hosted read-only audit requires the two candidate CTAs after deployment; a branch audit reports their absence as UNDEPLOYED without calling it an existing-production failure. The production may still serve the previous Hostinger build while a merge deployment is running: preserve failed first evidence and re-read only after actual deployment, never weaken CTA or canonical checks. No DNS/CDN or serving architecture changes.

## Active/target offer audit

`direct-offers.json` now explicitly distinguishes prior approved active programs, approved Stripchat via AVCams only, pending applications, unknown programs and non-cash rewards. It does not approve any new product or infer current country eligibility.

| Product/program | State and owner-only next action |
| --- | --- |
| AVCams / StripCash viewer and existing affiliate referral | Previously approved; used only on matching viewer/webmaster pilot. Same-window partner receipts still required for revenue |
| BongaCash | Existing active registry, not introduced by this pilot; current terms/account territory must be verified before new use |
| Lovense | Pending application. Official source in #198; current read challenged. Owner must apply, obtain approval and supply sanitized tracking URL/geo/terms, never credentials |
| Lovehoney | Brand-managed Impact program, not currently approved. Current read timed out; owner approval/tracking/region terms needed |
| DLsite | Official affiliate page reachable; pending approval, currency/geo/payout unverified. Expired2025 promotional30% is not a current rate |
| EROLABS | Bonus ECoins are not verified withdrawable USD affiliate earnings; no commercial CTA |
| Nutaku / FAKKU | USD program/approval unverified; no invented affiliate URL or rate |

Primary source links remain internal registry/research metadata, not new unapproved user-facing exits. Sources: Issue198 and official links already recorded there; current read failures are observation limits, not permission to bypass provider controls.

## 7/28-day evaluation

Record deployment time first. Evaluate each exact page and unique CTA source against matched seven- and28-day periods once settled: GSC impressions/clicks/CTR/position, GA4 consent-respecting engaged landing sessions and `affiliate_click`, partner-qualified signups/purchases and confirmed USD commissions only when source/window joins exist. Keep unknown attribution and provider-default totals separate. No causal lift is claimed from CTA count, CI, HTTP200 or early clicks. Target: more qualified next-step clicks and partner-confirmed USD per relevant page; zero unrelated offers, false signup claims, consent changes or negative layout regressions.
