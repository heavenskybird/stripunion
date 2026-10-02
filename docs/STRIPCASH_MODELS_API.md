# StripCash Models API — StripUnion

Updated: 2026-10-02

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
