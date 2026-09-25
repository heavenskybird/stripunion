# StripUnion Production Cutover + Google Search Console

## What the September 25, 2026 screenshots confirm

- Google Search Console already has a verified Domain Property for `stripunion.com`.
- The account owner is a verified owner.
- Search Console currently reports 1 indexed page and 3 non-indexed known pages from the old production site.
- No sitemap has been submitted in Search Console.
- The current public `stripunion.com` is still the old Hostinger AI Builder site, not the GitHub/Astro staging build.

## Critical production switch

The GitHub/Astro build intentionally defaults to noindex.

Before or at the same time as binding `stripunion.com` to the new Hostinger Web App, set the Hostinger Web App environment variable:

`PUBLIC_ALLOW_INDEXING=true`

Then redeploy.

Do not submit the new sitemap until the production domain is serving the new Astro build and the indexing switch is enabled.

## Production verification

After cutover, verify these URLs in a normal browser:

- https://stripunion.com/
- https://stripunion.com/stripchat
- https://stripunion.com/stripchat-pricing
- https://stripunion.com/stripchat-vs-chaturbate
- https://stripunion.com/stripchat-private-shows
- https://stripunion.com/stripchat-app
- https://stripunion.com/robots.txt
- https://stripunion.com/sitemap.xml

Expected:

- canonical URLs use `https://stripunion.com/...`
- page meta robots = `index,follow`
- `robots.txt` contains `Allow: /`
- `robots.txt` references `https://stripunion.com/sitemap.xml`
- sitemap returns XML and lists the current indexable pages

## Search Console

After the checks above pass:

1. Search Console → Sitemaps
2. Submit: `https://stripunion.com/sitemap.xml`
3. Use URL Inspection for:
   - homepage
   - /stripchat
   - /stripchat-pricing
   - /stripchat-vs-chaturbate
   - /best-live-cam-sites
4. Request indexing for the most important commercial pages.
5. Monitor Pages and Performance over the next several days/weeks.

## Do not do

- Do not submit the staging `hostingersite.com` sitemap.
- Do not set `PUBLIC_ALLOW_INDEXING=true` on staging.
- Do not leave the old AI Builder site active on `stripunion.com` after production cutover.
- Do not delete Search Console property; the existing Domain Property is correct.
