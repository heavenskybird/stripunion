# StripUnion Live Models Worker

This Worker is a private data-service boundary between the StripCash Models API and the public StripUnion site.

## Domain separation

- `stripunion.com` remains the public editorial/discovery site.
- `avcams.online` remains the commercial live-cam destination.
- The Worker is account-level Cloudflare infrastructure. It can be deployed under a `workers.dev` hostname even when the Cloudflare account currently contains `avcams.online`.
- The Worker does not require `stripunion.com` to be a Cloudflare-managed DNS zone.
- Browser CORS is restricted to the approved StripUnion origins in `wrangler.toml`.
- Model-card conversion links still route through StripCash tracking to `targetDomain=avcams.online`.

A custom worker hostname under `stripunion.com` is optional and can be added later if that zone is moved or delegated to Cloudflare. It is not required for the initial deployment.

## Secrets and variables

Required GitHub Actions configuration:

- Secret: `STRIPCASH_MODELS_API_KEY`
- Secret: `CLOUDFLARE_API_TOKEN`
- Variable: `CLOUDFLARE_ACCOUNT_ID`
- Variable: `LIVE_MODELS_WORKER_DEPLOY_ENABLED=true`

The Cloudflare API token must have permission to deploy Workers in the selected account. The Account ID is account-scoped, not domain-scoped.
