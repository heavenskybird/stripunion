# Sprint B: attribution and GA4 evidence

Base: main `ab0f9258` on 2026-11-12. Offline diagnostics only; no production
Worker, browser, affiliate request, postback or historical-state mutation.

## What is established

The tracked first-party snapshot collected **2026-11-12 16:26:24 Asia/Shanghai**
(`08:26:24Z`) now contains **45 clicks / 15 postbacks / 3 matched / 12 unmatched**.
The issue's 44/13/1 baseline has advanced. The two events observed by the new
diagnostic window since 13:23:11 Asia/Shanghai (`05:23:11Z`) both matched; their
currency and transaction IDs were absent. The 12 unmatched events fall outside
that diagnostic coverage. This does **not** establish that they predate original
click instrumentation or identify their individual causes.

GA4's tracked snapshot collected at 16:26 Asia/Shanghai covers **October 12–
November 11**, with main sessions=0, Blog sessions=12 and affiliate_click=0.
These are whole-window values; the issue's Blog=4 describes a different scope.
The restored tag's production build was November 12 11:09 Asia/Shanghai
(`03:09:02Z`, production acceptance run 43150236889). The snapshot contains no
GA4 property timezone. Consequently the exact before/after boundary is UNKNOWN:
November 12 03:09Z is still November 11 in American timezones. Neither this
settled-date snapshot nor tag presence proves actual post-deployment event receipt.

The attribution source is a **cumulative first-party AVCams** summary. GA4 is a
date-bounded, consent-sensitive analytics dataset. They cannot be equated or
subtracted to infer lost events. UNKNOWN-currency 224.25 is not USD revenue.

## Contract and remaining causes

- `src/lib/affiliate.js` preserves configured affiliate destinations and source
  parameters. `BaseLayout.astro` attaches `memberId` at click time only for AVCams.
  Direct referral links may emit GA4 events but intentionally do not populate this
  AVCams first-party click store. `p1/p2/p3` are attribution dimensions, not join IDs.
- The Worker normalizes `memberId`, `member_id`, `memberid` into `su_...` IDs.
  Generic `clickId`/`subId` are not accepted aliases. Do not guess a provider
  parameter mapping or change commercial URLs without the actual documented
  provider contract and redacted request evidence.
- The Worker joins on that exact normalized ID and retains records for 30 days.
  Missing/invalid IDs, missing clicks, ordering races, retention expiry, older
  instrumentation and unsupported provider aliases are distinct possibilities.
  The aggregate summary cannot disambiguate the historical 12.
- `normalizePostback` records receiver time, not a provider event timestamp.
  Offline retention diagnoses therefore require an explicitly supplied
  `receivedAt`, not a fabricated transaction time. Missing transaction IDs also
  limit distinguishing genuinely separate otherwise-identical notifications.
- Consent defaults for analytics and advertising are denied. The experiment
  path checks stored consent. The affiliate-click handler, however, has no
  equivalent analytics-grant check before first-party click dispatch. This is a
  **confirmed source-path gap requiring a focused consent review**; it does not
  itself prove why GA4 is zero. Google's cookieless Consent Mode behavior is
  separate from consent-required first-party tracking/storage. The offline trace
  checker detects telemetry before grant and after revocation. This PR does not
  change the handler or relax consent.

## Delivered diagnostic and tests

```sh
node --test scripts/test/attribution-funnel-diagnostics.test.mjs
node scripts/attribution-funnel-diagnostics.mjs \
  ops/seo-data-layer/data/raw/2026-11-11/ga4.json \
  ops/seo-data-layer/data/raw/2026-11-11/attribution.json \
  2026-11-12T03:09:02Z
```

An optional fourth argument is a **verified GA4 property IANA timezone**; do not
guess it. The CLI reads local files and prints aggregate evidence only. Its pure
helpers classify synthetic joins without outputting IDs, payloads or URL queries.
Fixtures exercise all supported ID aliases, unsupported SubID, missing/invalid
identity, 30-day expiry, reversed/unknown time, ambiguous clicks, source-page
availability, currency, missing transaction IDs, consent revocation, hostname
scope and timezone boundaries. Nothing repairs or sends a transaction.

## Production acceptance still required (not performed)

1. Read the existing GA4 property's timezone and relevant reporting intervals.
   In a separately authorized browser session, observe no consent-required
   tracking/storage before grant; explicitly grant analytics using the existing
   banner and observe page_view/session_start/affiliate_click delivery with the
   correct main hostname. Record only event names, timestamps and status codes;
   never retain IDs, outbound query strings, headers or a raw HAR in Git.
2. Test the outbound contract using a local mocked destination/Worker first.
   A real click increments business counts, even if no purchase is made; do not
   silently create one during this offline sprint. A future authorized test must
   label itself and avoid fake purchases/postbacks.
3. Obtain redacted, provider-confirmed parameter evidence before changing any
   alias. Keep the historical 12 unmatched and UNKNOWN currency unchanged.
4. Reconcile a genuinely post-deployment settled GA4 window with identical
   hostname/period scope; consent-denied visits are not automatically lost events.

This standalone diagnostic can be reviewed independently of R1. No runtime code
or deployment workflow changed. Future consent or Worker fixes need their own
gated acceptance; this PR does not claim GA4 or attribution production recovery.
