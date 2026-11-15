# Workstream B — USD revenue evidence and page conversion signals

Canonical source: `heavenskybird/stripunion`; implementation branch `codex/revenue-truth-20261115`. This is an aggregate GET-only diagnostic and Growth Brain improvement, not a Worker deployment, historical reconciliation or verified earnings uplift.

## What changed

- `ops/growth/lib/revenue-truth.mjs` distinguishes **owner-confirmed business currency USD**, **confirmed scoped USD commission**, **pending/unverified provider and postback amounts**, and **unknown evidence**. Absent values stay `null`; no source currency, join or revenue is repaired.
- Confirmed commission requires exactly one scoped provider commission statement with period, currency, commission amount, provenance hash and explicit owner review. There is no automated statement importer or statement in the current pipeline, so current confirmed USD remains **UNKNOWN**, not zero. Multiple statements are not silently summed. A payout balance/due card is not a scoped earnings statement.
- The existing StripCash normalizer now labels its default-period semantics and business-currency assertion explicitly; null/empty monetary fields cannot become numeric zero. Its CLI behavior remains unchanged. Importing its pure normalizer does not call the provider.
- Growth Brain reads the latest aggregate sources independently, embeds `commercialState.revenueTruth`, and adds financial-evidence holds plus page-level joined registration/purchase/refund signals. Exact known source routes resolve page keys; underscore aliases are retained separately. Joined events can prioritize reviewing an existing page, but never create new pages, fuzzy-join aliases, infer unique buyers, or claim qualified/paid commission. Stale or inconsistent evidence is ineligible.
- `scripts/revenue-readonly-acceptance.mjs` makes at most **one GET per provider**: the already configured StripCash Statistics default endpoint and existing first-party `/analytics/summary`. It projects only allowed aggregate fields, writes sanitized artifacts and runs Growth Brain into an artifact directory, not tracked decisions.
- `.github/workflows/revenue-readonly.yml` has `contents:read`, no checkout credential persistence, no production state writer and no deployment/Google/Buffer client. It runs offline tests, those two GETs and `git diff --exit-code`, then retains artifacts for 14 days. A literal unpadded Base64URL aggregate report in job logs is readable through the GitHub connector.

## Source facts and limits

The canonical saved snapshot read during development reports 50 first-party clicks, 15 postbacks, 3 matches and **12 unmatched**. `diagnostics.since=2026-11-12T05:23:11.967Z` covers only 2 postbacks, both matched. Thus **all 12 unmatched causes remain unproven**. Missing consented click records, missing/invalid member IDs, 30-day record expiry, legacy instrumentation or source/window mismatch are hypotheses, not findings. The deployed endpoint exposes summary counters, not an authenticated raw historical event export, so this work does not pretend to identify the 12 causes.

Saved postback `revenueByCurrency.UNKNOWN=224.25000000000003` remains an **unknown-currency reported amount**, not confirmed USD earnings. The deployed normalizer accepts `revenue`, `payout`, `commission`, `earnings` and `amount` aliases; the aggregate alone cannot establish net commission semantics or transaction identity. New diagnostics also report 2 unknown currencies and 2 missing transaction IDs, but that does not identify the fields or causes of earlier 13 events.

The Statistics API returns `signup=1`, purchases/earnings zero in its **default, undocumented date scope**. This is not an assertion of literal zero lifetime USD income. It cannot be compared to the owner's separately dated Today dashboard (206 clicks / 0 signups / 0 first purchases / $0 scheme earnings), a ~$2 balance, or $222 payout-due card. The current collector does not establish an exact clicks field, timezone, geo, campaign/SubID cohort, attribution window or payout status. No date/group parameter is guessed or sent to an undocumented API.

Page-key evidence currently establishes one `member_registration` plus age-verification events on `stripchat-alternatives`; this is useful conversion-stage evidence, not a qualified unique customer or paid commission. Page and site financial data are not reassigned to search keywords. The framework preserves the commercial objective without declaring a winner from visits, raw clicks or ambiguous money.

## Real acceptance

The branch push triggers the read-only workflow using the existing GitHub secrets `STRIPCASH_STATS_API_TOKEN` and `STRIPCASH_POSTBACK_SECRET`; no new key or credential copy is requested. Check the exact head's run, `REVENUE_READONLY_ACCEPTANCE` log and `revenue-readonly-RUN_ID` artifact before declaring live GET success. The artifact includes `revenue-truth.json`, report Markdown, isolated Brain JSON/Markdown and sanitized source projections.

A green GET proves access and current aggregate evidence, not conversion creation, historic cause recovery, qualified registration, paid settlement or same-window revenue. There is no live financial success claim until provider evidence supplies it.

## 7/28-day measurement and smallest owner action

For each pilot / next CTA batch record release SHA, canonical page, offer/referral type, `sourceId/campaignId/p1/p2`, change timestamp and a settled 7/28-day before/after window. Evaluate provider-confirmed registration, first purchase, eligible model milestone and net USD commission independently from GSC impressions/clicks and consented GA4 engagement/affiliate_click. Use same provider timezone, country, source and attribution window. EPC and conversion rate remain null until the partner numerator and denominator are a matched cohort. No raw member IDs, emails, model identities or sensitive financial export is required in Git.

Only the owner can currently supply/review authenticated provider evidence: one consolidated **same-window 7/28-day Statistics + Payout History export** with period/timezone, scope, campaign/SubID, net USD commission and paid/approved status, plus confirmation of postback amount/currency/transaction macro semantics. Sanitize personal identifiers and credentials; keep full statements private and bind a SHA256 in a reviewed evidence record. Do not change postback templates or send artificial conversions just to obtain a green report.

Rollback: revert the focused PR. Existing snapshots/history, Worker code/deployment, social and Blog switches, DNS/CDN, R1 receipts, single-writer guards and settlement configuration are untouched. No control-plane or production financial write is part of acceptance.
