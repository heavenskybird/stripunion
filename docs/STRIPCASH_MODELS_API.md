# StripCash Models API — StripUnion

Updated: 2026-10-03

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
- upstream refresh attempts are separated by at least 10 seconds, stricter than the documented 5-second limit;
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
