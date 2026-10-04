# First-party editorial publishing

StripUnion no longer treats WPWriter as critical publishing infrastructure.

## Primary high-throughput path

GitHub-tracked editorial guides under `src/data/guides/*.js` publish directly to the canonical Astro site through the existing Hostinger deployment from `main`.

The path is:

`hourly growth engine -> GitHub guide module -> PR/checks -> main -> Hostinger deploy -> live guide -> editorial-distribution.yml -> Buffer/X + Telegram`

This path:
- does not consume WPWriter post-generation credits;
- supports category rotation and many independent article files;
- generates indexable static URLs under `/guides/<slug>`;
- adds guides to the main sitemap automatically;
- exposes relevant guides from their category hubs;
- generates non-explicit category cover art without an image-generation quota;
- waits for the production URL to return HTTP 200 before social distribution.

## Optional direct WordPress path

For content that should live on `blog.stripunion.com`, GitHub can publish directly through the WordPress REST API without WPWriter.

Workflow:
`.github/workflows/wordpress-editorial-publish.yml`

Publisher:
`scripts/publish-wordpress-json.mjs`

Content payloads live under:
`ops/editorial/wordpress-queue/*.json`

Required GitHub configuration:
- repository variable `WP_SITE_URL=https://blog.stripunion.com`
- repository secret `WP_USERNAME`
- repository secret `WP_APP_PASSWORD`

Use a dedicated WordPress user/application password with the minimum role needed to publish posts. Do not reuse the normal administrator password and never commit credentials.

The WordPress path is opt-in because credentials are an account-level boundary. Until configured, GitHub/Astro publishing remains fully operational and is the preferred no-credit path.

## Tool independence

WPWriter remains useful for reading the live CMS, editing existing posts, SEO checks, media operations and ad-hoc publishing when convenient. It is not allowed to become a throughput bottleneck. The same rule applies to future external tools: if quotas, pricing or reliability constrain the content objective, preserve the useful capability and move the critical path to first-party or replaceable infrastructure.
