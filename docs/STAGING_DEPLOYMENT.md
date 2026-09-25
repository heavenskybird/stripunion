# Hostinger Staging Deployment Runbook

Use this only after the `main` branch build is green.

## Goal

Deploy the GitHub codebase to a temporary Hostinger Web App URL for visual and functional QA.

Do **not** move `stripunion.com` yet.

## Hostinger setup

1. Open Hostinger hPanel.
2. Go to **Websites** → **Add Website**.
3. Choose **Deploy Web App / Node.js Web App**.
4. Choose **Import Git Repository / GitHub**.
5. Authorize the GitHub account if requested.
6. Select:
   - repository: `heavenskybird/stripunion`
   - branch: `main` (if a branch selector is shown)
7. Framework: let Hostinger auto-detect **Astro**. If manual selection is required, choose Astro.
8. Node.js: **22.x**.
9. Install command: `npm install` if Hostinger asks.
10. Build command: `npm run build`.
11. Static output directory: `dist` if Hostinger asks.
12. No environment variables are required for the current build.
13. Deploy to the temporary Hostinger-provided URL.

## Do not do yet

- Do not point `stripunion.com` to the new app.
- Do not delete the existing AI Builder site.
- Do not add analytics scripts yet.
- Do not add a payment method or ecommerce integration.
- Do not buy Hostinger AI credits for this migration.

## QA after deployment

Verify on desktop and mobile:

- homepage
- /live-cams
- /stripchat
- /chaturbate
- /livejasmin
- /adultfriendfinder
- /vr-ar
- /vrporn
- /sexlikereal
- /affiliate-disclosure
- /privacy-policy
- /sitemap.xml
- /robots.txt

Also verify:

- every commercial Stripchat CTA opens the approved `go.whitetrafsa.com` affiliate URL
- other reviewed brand names do not disguise Stripchat redirects
- Blog opens `https://blog.stripunion.com`
- no broken layout, missing text, horizontal mobile overflow, or 404s on the routes above

## Deployment loop after staging is connected

GitHub `main` push → Hostinger automatic build/deploy → staging QA.

Only after the staging release passes SEO, conversion, mobile and link checks should the production domain be moved.


## Search-index safety

The code now defaults to **noindex** and a site-wide `robots.txt` disallow unless:

`PUBLIC_ALLOW_INDEXING=true`

is set at build time.

For the temporary `hostingersite.com` staging deployment, leave that variable unset (or set it to `false`).

Only when the new application is ready to replace the production site on `stripunion.com` should the Hostinger Web App environment variable be set to:

- name: `PUBLIC_ALLOW_INDEXING`
- value: `true`

Then trigger a new deployment and verify:

- page meta robots = `index,follow`
- `/robots.txt` = `Allow: /`
- sitemap URL = `https://stripunion.com/sitemap.xml`

This prevents the temporary staging hostname from competing with the production domain in search.
