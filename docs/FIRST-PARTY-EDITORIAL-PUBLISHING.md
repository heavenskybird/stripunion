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

## First-party WordPress path

For content that belongs on `blog.stripunion.com`, GitHub publishes directly through the WordPress REST API using the dedicated publisher account and Application Password. WPWriter is not in the critical path.

Workflow:
`.github/workflows/wordpress-editorial-publish.yml`

Publisher:
`scripts/publish-wordpress-json.mjs`

Payloads:
`ops/editorial/wordpress-queue/*.json`

Publication ledger:
`ops/editorial/publication-ledger/wordpress/*.json`

The workflow runs automatically when queue JSON files are added or changed on `main`, and can also be run manually for a specific queue file.

Required GitHub configuration:
- repository variable `WP_SITE_URL=https://blog.stripunion.com`
- repository secret `WP_USERNAME`
- repository secret `WP_APP_PASSWORD`

Use a dedicated WordPress Editor user/application password. Never reuse or commit the normal administrator password.

### Supported first-party capabilities

The publisher now supports:
- idempotent create/update by slug;
- draft/private/publish status;
- category and tag resolution by real ID or by name;
- controlled creation of missing terms when `create_missing_terms=true`;
- repository, remote or quota-free generated featured images;
- media upload, alt text, title and caption;
- automatic Main-to-Blog cross-link fallback plus explicit related links;
- best-effort Yoast title/meta/focus-keyword writes when the site's REST configuration exposes those fields;
- live HTTP/canonical/noindex verification for published URLs;
- sitemap-evidence checks;
- a GitHub publication ledger for every queue item.

New first-publish transitions are also observed by the first-party StripUnion Growth Bridge WordPress plugin, which dispatches `social-distribution.yml` for Buffer/X and Telegram. The installed IndexNow/SEO layer can continue to react to the normal WordPress publish transition.

If Yoast private meta is not writable through WordPress core REST, the publisher does not fail the article. WordPress title/excerpt remain the safe fallback, and the ledger records whether Yoast REST writes were available. A future first-party plugin endpoint can expose only the required SEO keys if we decide the extra write control is worth maintaining.

## Example payload

```json
{
  "title": "Example Guide",
  "slug": "example-guide",
  "excerpt": "Concise search/social summary.",
  "content": "<h2>Section</h2><p>Production-ready HTML.</p>",
  "status": "publish",
  "categories": ["Adult Games"],
  "tags": ["privacy", "beginner guide"],
  "create_missing_terms": true,
  "seo": {
    "title": "Example Guide | StripUnion",
    "description": "A concise meta description.",
    "focus_keyword": "example guide"
  },
  "featured_image": {
    "mode": "auto",
    "alt_text": "Abstract editorial illustration for the example guide"
  },
  "related_links": [
    {
      "title": "StripUnion Guides",
      "url": "https://stripunion.com/guides/"
    }
  ]
}
```

## Tool independence

WPWriter remains useful for reading the live CMS, occasional editing, SEO inspection and media operations when convenient. It is optional convenience infrastructure, not production-critical infrastructure.

The same rule applies to future tools: if quotas, pricing, permissions or reliability constrain the content objective, preserve the useful capability and move the critical path to first-party or replaceable infrastructure.
