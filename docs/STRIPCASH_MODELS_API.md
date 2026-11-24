# StripCash Models API — StripUnion

Updated: 2026-11-20

## Purpose

Use the StripCash Models API only for a future bounded **Live Now** discovery layer on StripUnion. Do not expose the API key in browser code and do not treat the API as required for the existing AVCams conversion flow.

## Official integration facts used by this repository

- Models endpoint: `https://go.whitetrafsa.com/app/models-ext/models?userId={userId}`
- API access requires a domain-specific key created in StripCash → Service → API for Domain.
- Send the key as `Authorization: Bearer ...`.
- The documented rate limit is no more than one request every 5 seconds.
- The API returns currently online models and includes fields such as username, status, tags, geobans, snapshot URLs, click URL, languages, country, favorite count, and viewer count.
- Geobans must be respected in listings and profile pages.
- Snapshot URLs must be used directly and must not be downloaded/rehosted.
- If a model has not appeared for 30 consecutive days, stored model-related data must be removed.

## Current implementation

A manual workflow named **StripCash models API schema probe** exists.

It is intentionally schema-only:
- no API key is printed;
- no model usernames are printed;
- no snapshot/room URLs are printed;
- no country/language/tag values are printed;
- only field names, types, and model-array length are logged.

## Human setup when requested

1. In StripCash → Service → API for Domain, authorize `stripunion.com`.
2. Generate/copy the domain API key.
3. In GitHub repository Actions secrets, add:
   `STRIPCASH_MODELS_API_KEY`
4. Run the manual workflow once.

Do not paste the API key into chat or commit it to the repository.

## Architecture constraint

The current main site is statically generated. A genuine real-time **Live Now** grid should not expose the domain API key in client-side JavaScript and should not be implemented as frequent Git commits.

After the schema probe, choose one of:
- a small private server/worker endpoint on an approved domain that fetches, filters and caches model data; or
- a StripCash-hosted widget/creative that can safely provide dynamic inventory without exposing the API key.

The decision must preserve geoban handling, rate limits, image-hosting rules, and affiliate attribution.


## Real schema probe — 2026-10-03

The production-safe probe succeeded with the configured domain API key.

Observed top-level fields:
- `CDNDefaultHost: string`
- `CDNHosts: array`
- `count: number`
- `models: array`
- `total: number`

The response contained **10,020 models** at probe time.

Observed model fields:
- `id`, `username`, `status`, `gender`, `broadcastGender`
- `broadcastHD`, `broadcastVR`
- `snapshotUrl`, `popularSnapshotUrl`, `verifiedPopularSnapshotUrl`, `previewUrlThumbSmall`, `avatarUrl`
- `tags`, `languages`, `modelsCountry`
- `viewersCount`, `favoritedCount`
- `goalMessage`, `earnedForGoal`, `neededForGoal`
- `stream`, `clickUrl`, `geobans`

Observed geoban fields:
- `blockedCountries: array`
- `blockedRegions: object`
- `blockedLanguages: array`

The probe intentionally did not log model identities, URL values, country/language/tag values, or the API key.

## Selected production architecture

The repository now contains `services/live-models-worker/`, a Cloudflare Worker + single global Durable Object architecture.

Why this shape:
- the StripCash key stays server-side;
- one Durable Object serializes upstream refreshes globally;
- upstream refresh attempts are separated by at least 60 seconds, stricter than the documented 5-second limit;
- only a bounded top-500 public catalog is retained;
- each response applies country, region and Accept-Language geobans before returning cards;
- unknown location is handled conservatively for geographically restricted models;
- snapshot URLs are returned directly from StripCash and are never downloaded or rehosted;
- the Durable Object erases stored catalog state after 24 hours without refresh, well inside the 30-day removal requirement;
- browser responses exclude `clickUrl` so the user-facing conversion route remains AVCams.

The AVCams page now has a progressive Live Now component. Until `PUBLIC_LIVE_MODELS_API_URL` is configured, it falls back to the normal tracked AVCams CTA.

## Deployment gate

Worker deployment is intentionally gated by repository variable:

`LIVE_MODELS_WORKER_DEPLOY_ENABLED=true`

Required GitHub configuration:
- secret: `CLOUDFLARE_API_TOKEN`
- variable: `CLOUDFLARE_ACCOUNT_ID`
- existing secret: `STRIPCASH_MODELS_API_KEY`

After the worker is deployed, use its public `/models` endpoint as `PUBLIC_LIVE_MODELS_API_URL` for the main-site build, or commit the final public worker URL as the default once verified.


## Current image-only compliance contract (2026-11-19)

`LiveModelsGrid.astro` uses direct upstream HTTPS preview images and tracked AVCams
search routing. It does not consume `stream`, load an HLS library, embed a player,
or proxy media. Keep that architecture: the November 30, 2026 legacy HLS shutdown
requires the official Stripcash Player only if playback is deliberately introduced.
Official notice: https://t.me/s/stripcashnews ; guide:
https://stripcash.com/documentation/player-guide?tab=player_guide%7Cplayer_guide_for_aggregators .
The guide page returned no readable content during this audit; do not infer its
current embed parameters from old Help Center examples of external HLS players.

The catalog is eligible for display for at most 90 seconds after a successful
refresh. Failed HTTP/network/JSON/schema refreshes erase catalog/fetchedAt and
return 503; cooldown never serves expired data. Successful empty feeds replace
previous inventory. `validUntil` describes display eligibility, separate from the
24-hour storage cleanup alarm. Missing/malformed geobans are excluded rather than
converted into unrestricted models. Unknown geography, region or language hides
models when the applicable restriction cannot be evaluated.

Browser responses use `no-store`. The grid waits for viewport entry, then polls 60 seconds after each completed request while in the viewport and on a focused, visible, online page. It
rejects stale/unverifiable/non-public cards, expires cards at the original refresh
deadline, and clears them on failed requests, offline events, tab hiding, loss of focus or viewport exit. Inactive requests are aborted and late responses ignored. Unchanged inventory keeps its existing image elements; loaded/unavailable analytics fire only on availability transitions.
The single global Durable Object still enforces a minimum 60-second upstream
interval (browser polling is not upstream polling); requests join an active refresh.
There is no instantaneous online guarantee between snapshots. Client clock skew
may conservatively hide cards; the tracked generic AVCams fallback remains usable.

The 60-second refresh interval and separate 90-second display deadline reduce API use while allowing healthy revalidation before expiry. An older shared snapshot can trigger necessary revalidation at expiry before the next regular poll. Browsers without IntersectionObserver use the same activity checks without viewport gating. The deadline is never extended by reusing cached responses, and a failed revalidation hides cards immediately even inside the 90-second window. The documented five-second limit is a minimum request interval, not evidence of a required five-second refresh. Current authenticated documentation was not readable during this audit; no claim of partner approval for the 90-second window is made.

Catalog replacement drops absent/offline/deleted models on the next successful
refresh; failure hides and erases inventory, and idle storage expires in 24 hours.
No persistent model profile, snapshot archive or rehosted preview is introduced.
Stripcash also announces a Deleted Models endpoint. Its current authenticated
schema and account-specific obligations remain to be confirmed before integrating
it; do not invent an endpoint or add another API poller. The manual schema probe
uses the same credential independently of the Durable Object, so avoid running it
concurrently with live refreshes until provider rate-limit scope is confirmed.

Regression checks:

```sh
npm test --prefix services/live-models-worker
ASTRO_TELEMETRY_DISABLED=1 PUBLIC_ALLOW_INDEXING=true npm run build
node scripts/test-live-models-browser.mjs
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using a system Chromium.
Detailed findings, deployment gates and evidence:
`docs/audits/2026-11-19/STRIPCASH-IMPLEMENTATION-REPORT.md`.
