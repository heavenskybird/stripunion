# Index recovery: observed redirect consolidation

Production acceptance run 43265526487 (2026-11-12 17:13Z) verifies five hub HTML/canonicals, all 40 recovery guides then present, GA4 default consent denied, robots and sitemap, and Hostinger completed production build 01a1d0bb-1f47-70fd-b1de-e7299e5bb853. Provider does not expose an exact Git SHA; do not claim provider commit proof. Merge baseline db41398ce90d0ebdfea4fcd9de973614b86bc1c6. Later main b9f4770d954e9318be2aa93aa6b0680b1b8b642a has additional publications.

That actual production evidence records guide bare URLs returning 301 to slash URLs, but guide canonical/schema/sitemap still nominate bare URLs. Align those three discovery signals with the observed final URL, without changing server redirects, Astro routing, publication ledger historical URLs, or public content. This does not prove Google's unknown/discovered state is caused by that discrepancy or guarantee indexing.

Guide sitemap lastmod now derives only from validated content updatedAt/publishedAt; no build-time freshness claims. Invalid/future dates are omitted. Five demand-backed hub edits from #189 remain intact. www currently returns 200 with apex canonical; an actual www 301 remains a host-level gap, not fixed by canonical code and no DNS/WAF changes are made here.

Inspection previously capped at 60 URLs, silently omitting later recovery guides. Bound a single official read-only scan to 200, explicitly report omittedRestored and sampleLimit; inspection still stops on authorization/rate-limit rejection. Official rankings are windowed and delayed, not a same-day release outcome. No submission, paid provider, producer dispatch or social send is performed by the evidence job.

Release: require exact-head Build/SEO/visual and official-source evidence, fresh writer inventory and successful runtime receipt, production rollback baseline and post-deployment final HTTP/canonical/schema/sitemap plus source fingerprint acceptance. Revert this focused commit through a PR if canonical or sitemap fails. Monitor GSC query/page 7/28-day windows separately from Bing market demand; do not assert CTR lift before settled evidence.
