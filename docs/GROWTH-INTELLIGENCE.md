# Traffic and competitor intelligence

## Daily workflow

`traffic-competitor-daily.yml` runs public-only competitor collection, Astro content inventory, and an evidence-based opportunity report. It shares `growth-data-persistence` concurrency with SEO snapshot/report jobs so automated commits do not race. The collector requests HTTPS pages and sitemaps from an explicit domain allowlist, follows only same-domain/www redirects, throttles requests, caps pages and response bytes, and stores extracted metadata/signals rather than article bodies or downloaded assets. Collection errors remain visible in that day's diff.

The seeded competitors are Porneed (`porneed.com`), WebcamsChats (`webcamschats.com`), CamSitesReviews (`camsitesreviews.com`), FetishAura (`fetishaura.com`), and CamChatReviews (`camchatreviews.com`). The first-party evidence for the latter four is each site's public homepage/About page. Porneed is named as a review property by its StripCash affiliate in [this public article](https://stripcash.com/blog/where-the-cam-buyers-actually-come-from/); if its origin is inaccessible, the daily collector reports the failure rather than substituting a different site. Confirm that origin from a first-party Porneed page when it becomes reachable.

Daily snapshots and URL diffs live under `ops/growth/competitors/data/`. `ops/growth/opportunities/latest.json` and `.md` combine GSC and Bing query evidence with sitemap-change context, page inventory, commercial-intent heuristics, confidence and risk. Competitor URL changes are marked as landscape context unless a topic match is established. Impacts are qualitative; the system does not forecast guaranteed visits, signup, or revenue.

## Content scoring and publication safety

`ops/growth/content-inventory.mjs` ranks existing public-facing Astro routes across commercial intent, measured keyword opportunity, uniqueness/overlap, freshness signals, internal-link potential, affiliate relevance, and completeness. Its approximate source-text length is a triage signal, not proof of editorial value. The output is explicitly an Astro update inventory, not a WordPress draft export.

There is no authenticated WordPress draft-listing tool or tracked draft inventory in this repository workflow. Therefore the daily output records WordPress draft inventory, draft count, and publish-ready draft count as unavailable/null. It must not infer or auto-publish WordPress content. `scripts/content-quality-gate.mjs` exports a fail-closed candidate assessor: a candidate needs at least 350 words, three documented decision-value elements, a title/canonical URL, and no supplied exact-title/content duplicate. It is an acceptance helper, not a publisher.

## Traffic control plane

The weekly SEO report includes Organic, Social, Community/Referral, Paid, and Total sessions; unclassified sessions remain separately visible. GA4 engaged sessions are the qualified-session proxy. Affiliate outbound CTR is click events divided by sessions and is labeled with that denominator. GSC supplies organic impressions/clicks; Bing's latest `InIndex` signal supplies indexed-page counts. The report also includes Astro commercial route count and top GA4 acquisition landing pages. WordPress publication count and content freshness remain unavailable until a dated CMS inventory is connected.

Signup, verified signup, first purchase, repeat purchase, and payout attribution are not connected. Reports must retain the explicit `AFFILIATE REVENUE ATTRIBUTION NOT YET CONNECTED` status and never infer StripCash revenue from GA4 events.

## Visual components

Astro discovery components live under `src/components/discovery/`. Gallery assets must be original or approved program creatives. Supply AVIF/WebP variants and intrinsic dimensions where available; source metadata or competitor imagery must never be used as creative assets. A rating block renders only when a source-backed score is passed.
