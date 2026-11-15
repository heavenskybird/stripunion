# Official Trending Now RSS and durable opportunity radar

This reader uses only `https://trends.google.com/trending/rss?geo=XX`, one allowed country (US/GB/CA/AU) per run. Google Trends Explore Alpha remains **NOT_GRANTED** and is never requested. RSS is a current news-trend snapshot; it is not Explore search history, exhaustive adult demand, absolute monthly volume or a substitute for GSC/Bing.

## Run and history

After the focused PR is reviewed and merged, Actions **Official Trends RSS radar** supports manual `geo` selection. The declared hourly schedule at minute 34 reads **US only** by default. This is a new, clearly separated read-only RSS clock; it does not duplicate an existing Trends collector or modify the R1/Telegram/Buffer clocks. The schedule is not deployed while the PR is unmerged. Other countries require separate manual runs until observed business evidence justifies a reviewed regional schedule expansion.

The job issues at most **one** fixed official HTTPS request, with a 15s timeout, manual redirects, 2 MiB response limit and a 10-minute minimum success interval. It honors ETag/Last-Modified; 429 delays at least one hour (bounded 24h; numeric Retry-After honored), 401/403 delay six hours without bypass, other errors 15 minutes. Bad XML or transport failure preserves the successful prior history. The XML parser rejects DTD/entities, malformed/unbalanced structure and oversized feeds; it does not fetch news articles, embedded URLs, external entities or unofficial Explore endpoints.

Actions Cache stores a versioned, country-bound state plus timestamped raw XML archives. Per-query key is SHA256(country + normalized query); the same query in two countries is two observations. An unchanged/304 feed adds an observation without changing original firstSeen. firstSeen is **our first successful collector observation**, not a provider trend-start time. `providerPublishedAt` is the RSS publication time, explicitly separate.

4h/24h/48h/168h statuses:

- `INSUFFICIENT_HISTORY`: no archived observation at/before the beginning. First run must show this for all windows, even if feed publication dates are old.
- `OBSERVATION_GAPS`: late/missed snapshots or stale last read (>90min gap).
- `OBSERVED_SNAPSHOT_HISTORY`: sufficient archived snapshots, never a claim to exhaustive trend history.

Cache retention/eviction or changing workflow version may reset local history; it then truthfully returns insufficient history. A GitHub cache is not a guaranteed permanent database. Archive cap 220 XML files, state observations max500, inactive query entries retained eight days/max5000. No manufactured historic CSV or retrospective firstSeen values. Future verified official CSV imports must retain their original capture, source, geo and time range.

## Commercial decisions

Approved registry offers are read from `ops/growth/offers/direct-offers.json`. No target offer is activated. Known adult platform brand and intent are required; generic celebrity, Prime Video and unrelated entertainment trends HOLD. Age-ambiguous/leak/nonconsensual terms HOLD. Brand-navigational target offers do not borrow an unrelated cam CTA. Alternatives intent can point to an already approved relevant alternative only after editorial review.

Existing first-party GSC query×page observations, cached Bing own-site query context and current route inventory accompany candidates with their source-as-of ranges. RSS labels are not mixed into site impressions. Existing high-value hubs rank ahead of new content. No index status is inferred from publication or CI (`indexStatus:UNKNOWN`). Normal popular evergreen GSC demand remains relevant if RSS has no adult commercial match.

A supported recent candidate may emit one **review-only** short draft and registry proposal. It is not put into an editorial, R1 or Telegram queue. If there is no genuinely timely relevant approved opportunity, output `NO_SUPPORTED_TIMELY_CANDIDATE`; do not produce filler to satisfy a quota. All existing content/source review, consent, R1 single-writer, Telegram 3/day/4h, X-off and Blog publication gates remain unchanged.

## Outputs and registry

Artifacts **trends-radar-RUN_ID** retain report.json, cache-state.json, current official XML when fetched, opportunity-proposals.json and opportunity-registry-report.json for 14 days. Logs emit a URL-safe Base64 JSON summary plus SHA256 so GitHub connectors can read and verify the report without a screenshot. Neither report status nor green tests imply production deployment or revenue.

Canonical `ops/growth/opportunity-registry.json` backfills eleven documented gaps with stable IDs and source URLs. The JSON is reviewed Git state, never silently rewritten by the collector. RSS discoveries are artifact proposals until a reviewed registry change. `opportunity-registry.mjs` validates unique identities, stage history, required next actions and real production/measurement proof. CI evidence cannot create DEPLOYED or MEASURED. Existing PR202 pilot served-page evidence Run43671270663 supports DEPLOYED only; new A/C/B branch changes remain separate and unmeasured. Backfilled transition times record observation of source state, not invented dates of original approval. Stuck accepted opportunities (>7d) and overdue measurement produce batched report alerts, not notifications or duplicate messages. The existing commercial radar can read that artifact and deduplicate on ID/classification.

The registry includes contextual guide exits; three-page webmaster pilot (DEPLOYED by independent served-page proof; not revenue measured); USD/unmatched attribution; relevant partner applications; model onboarding proof; RSS; Alpha; www redirect; Blog updates; scheduler evidence. Existing program IDs or unknown-currency events are never changed.

## Evaluation and rollback

Evaluate relevant shipped changes on matched 7/28-day GSC query/page/country/device impressions, CTR and position; GA4 consent-respecting engaged landing cohorts and affiliate events; partner-qualified signups and provider-confirmed USD earnings. Do not equate clocks, provider scopes or event currencies. First collect a baseline and proof of release; no lift claimed by this reader.

Disable this dedicated workflow to stop RSS reads. Reverting the focused PR removes the collector and reviewed registry code. Cache may be retained for audit or expire normally; never erase it merely to make a temporal gate green. No DNS/CDN, Google setting, receipt, social switch, WordPress write, Worker deployment, external recruitment, signup or conversion rollback is needed.

Official source references: https://support.google.com/trends/answer/3076011 ; https://developers.google.com/search/apis/trends ; https://support.google.com/trends/answer/4355000 . No Alpha approval is inferred from their availability.
