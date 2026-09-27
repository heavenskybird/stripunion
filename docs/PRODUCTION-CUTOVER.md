# Production Cutover Readiness

This document defines acceptance gates only. It does not authorize or perform a production cutover.

## Deployment environments

### Staging

- Host: `staging.stripunion.com`
- Build setting: `PUBLIC_ALLOW_INDEXING=false`
- Production GA4: must not load.
- Keep noindex behavior and staging-only affiliate attribution markers.

### Production

- Host: `stripunion.com`
- Build setting: `PUBLIC_ALLOW_INDEXING=true`
- GA4 setting: `PUBLIC_GA4_MEASUREMENT_ID=<authoritative discovered ID>`
- Resolve the ID from the read-only GA4 Admin API stream metadata; do not guess or copy it from old reports.

Production acceptance requires:

- HTTP 200.
- `index,follow` robots metadata and production robots behavior.
- Canonical URLs on `stripunion.com`.
- A valid production sitemap.
- The expected GA4 Measurement ID and working GA4 config loader.
- Affiliate click instrumentation.
- No staging affiliate markers in active production behavior.

## Editorial acquisition plane

`blog.stripunion.com` remains the independent WordPress editorial acquisition plane. This site's public GA4 instrumentation is checked separately against the authoritative production Measurement ID. This readiness document does not change WordPress settings.

## Current gate

Do not cut over until the authoritative stream identity is confirmed, production acceptance passes against the deployed production host, staging remains analytics-free, and any required Blog GA4 configuration has been completed and verified.

