# Two-site automation and growth control plane

StripUnion operates two independently hosted properties. The Astro main site and WordPress blog have separate deployments, health checks, indexing controls, and site-specific analytics. This repository holds shared reporting and automation; it does not make either site depend on the other's release process.

## Properties and delivery

| Property | Runtime | Deployment | Health signal |
| --- | --- | --- | --- |
| `https://stripunion.com` | Astro static site, Node.js 22 build | GitHub Actions build, then Hostinger Web App deployment | Public homepage, robots, sitemap; staging smoke where configured |
| `https://blog.stripunion.com` | WordPress | WordPress hosting and its existing publishing process | Public homepage, robots, sitemap, published-post REST endpoint and latest post |

The `Two-site health` workflow runs daily and on manual dispatch. Its main-site and blog jobs use public GET requests only; they do not authenticate to WordPress or change hosting, domains, content, or settings. The main job additionally runs the existing staging smoke checker when `HOSTINGER_STAGING_DOMAIN` is configured. A combined job reports Main, Blog, and Combined status.

WordPress publication and its existing Growth Bridge -> GitHub Actions -> Buffer distribution flow remain independent of Astro deployment. Health checks do not publish or update WordPress posts or Buffer content.

## Shared growth reporting

The SEO data layer collects GA4 and the `sc-domain:stripunion.com` Search Console domain property. GA4 landing and event reports include `hostName`; reports classify `stripunion.com` and `www.stripunion.com` as Main, `blog.stripunion.com` as Blog, and retain other/unknown hosts separately. GSC page rows are classified by page hostname. GSC daily totals remain the property-wide Combined totals because daily rows do not include a page dimension; do not add host page totals to those daily totals.

Weekly reports show Main, Blog, and Combined GA4 sessions, engaged sessions, `affiliate_click`, and GA4 revenue where available. Combined values come from the same GA4 rows and are not created by adding a second copy of domain totals. GSC reports show the single combined property totals and hostname-classified page metrics. GA4 revenue is not affiliate-network payout attribution; when the source has no reported revenue, the report says `REVENUE DATA NOT CONNECTED`.

Bing coverage is read from the configured `BING_SITE_URLS` collector result. The weekly report lists the configured/returned status per property and method. If the blog is absent it explicitly reports `BLOG BING COVERAGE NOT VERIFIED`; the required account action is to verify/add `https://blog.stripunion.com/` as a Bing Webmaster site and include it in the repository variable `BING_SITE_URLS`. Reporting does not modify Bing account settings.

## GA4 loading and click attribution

Astro reads the optional public build variable `PUBLIC_GA4_MEASUREMENT_ID`. It loads the GA4 tag only if `PUBLIC_ALLOW_INDEXING=true` and the value matches a GA4 Measurement ID (`G-` followed by an alphanumeric ID). Staging/noindex builds do not load GA4. The existing affiliate click event continues to emit `affiliate_click` with partner, placement, Stripcash campaign/creative/source, outbound URL, and first-touch acquisition source when `gtag` is available; the existing data-layer fallback remains available otherwise. Never invent a production Measurement ID. `.env.example` documents the variable, and CI can use a non-production placeholder solely to verify production artifact inclusion.

The WordPress checker reports public `G-` Measurement IDs found in rendered HTML; these identifiers are public configuration, not credentials. WordPress plugin settings remain outside this workflow.

## Manual operating notes

- Run `Two-site health` from Actions for an on-demand public check.
- Run the SEO data workflow before interpreting fresh weekly host-segmented metrics after this change; older GA4 snapshots do not contain `hostName`.
- Bing site membership must be verified in Bing Webmaster Tools by an account owner. The collector can only report the configured sites and API outcomes.
- No site settings, WordPress content, DNS, billing, or hosting resources are changed by this control plane.
