# StripUnion SEO Data Layer v0

## Objective

Build a first-party, low-cost SEO/traffic intelligence layer that replaces the core operational value currently provided by GSC Wizard for StripUnion, while remaining reusable enough to evolve into a standalone SaaS later.

The first version is an internal operating system for StripUnion, not a public product.

## What v0 should cover

### Data sources
- Google Search Console
  - clicks
  - impressions
  - CTR
  - average position
  - query / page / country / device dimensions
  - sitemap status
  - URL inspection where quota permits
- Google Analytics 4
  - sessions
  - users
  - landing pages
  - source / medium
  - country / device
  - events and key events
- Bing Webmaster Tools
  - clicks / impressions
  - queries
  - pages
  - crawl stats
  - crawl issues
  - backlinks
  - feeds / sitemaps
  - keyword research / trend signals
- Microsoft Clarity
  - page-level traffic and behavior metrics
  - rage/dead/error click signals
  - quickbacks / excessive scroll
  - engagement and scroll-depth context
- IndexNow
  - submission log
  - response status
- StripUnion site
  - sitemap URL inventory
  - page metadata
  - affiliate CTA inventory
  - content cluster / commercial intent tags

### Derived analyses
- query opportunities: high impressions + weak CTR
- ranking opportunities: positions 4-20
- newly appearing / lost queries
- newly appearing / lost pages
- page decay
- keyword cannibalization
- organic landing page quality
- channel/source mix
- affiliate-click conversion by page / source
- crawl/indexing anomalies
- sitemap-vs-index coverage
- daily / weekly change detection

## v0 architecture

```
Google Search Console API
GA4 Data API
Bing Webmaster API
IndexNow
StripUnion sitemap/crawl
        |
        v
scheduled collectors
        |
        v
normalized daily snapshots
        |
        v
analysis jobs
        |
        +--> Markdown/JSON reports
        +--> optional dashboard
        +--> ChatGPT/Codex-readable artifacts
```

## Cost strategy

Phase 0 should avoid a permanent paid SaaS dependency.

Recommended order:
1. GitHub Actions for scheduled collection.
2. Store compact daily JSON snapshots in this private repository while traffic is small.
3. Keep secrets only in GitHub Actions Secrets.
4. Migrate to a real database only when data volume or multi-user requirements justify it.

Possible later storage:
- PostgreSQL / Supabase
- Cloudflare D1
- ClickHouse
- DuckDB + object storage

Do not introduce a paid database merely for v0.

## Proposed repository layout

```
ops/seo-data-layer/
  README.md
  package.json
  src/
    config/
    collectors/
      gsc.mjs
      ga4.mjs
      bing.mjs
      indexnow.mjs
      site.mjs
    normalize/
    analyses/
      opportunities.mjs
      ranking-changes.mjs
      decay.mjs
      cannibalization.mjs
      indexing.mjs
      acquisition.mjs
    reports/
  data/
    raw/
    normalized/
    reports/
.github/workflows/
  seo-data-daily.yml
```

## Secrets

Never commit credentials.

Expected GitHub Actions secrets may include:
- Google OAuth/service-account credential material
- GA4 property ID
- Bing Webmaster API key
- optional IndexNow key
- later: Buffer API key
- later: affiliate-network API/postback secrets

Exact authentication choice must be implemented after checking the current official API requirements.

## Data model v0

### gsc_query_page_daily
- date
- query
- page
- country
- device
- clicks
- impressions
- ctr
- position

### ga4_landing_daily
- date
- hostName
- landing_page
- source_medium
- country
- device
- sessions
- active_users
- engaged_sessions
- key_events
- revenue

### bing_query_page_daily
- date
- query
- page
- clicks
- impressions
- position

### indexing_status
- checked_at
- url
- engine
- status
- crawl_state
- last_crawl

### page_catalog
- url
- content_cluster
- commercial_intent
- affiliate_network
- affiliate_offer
- indexable
- canonical
- last_modified

### affiliate_events
- occurred_at
- event
- hostName
- page
- placement
- network
- offer
- source
- medium
- campaign
- country
- device
- subid
- revenue

## Reports v0

Produce machine-readable JSON plus a compact Markdown summary.

Daily:
- indexing/crawl failures
- new/lost queries
- major traffic anomalies
- affiliate tracking failures

Weekly:
- top opportunities
- pages to refresh
- content gaps observed from first-party data
- pages with impressions but no clicks
- positions 4-20 with sufficient impressions
- organic landing pages with weak engagement
- affiliate click-through by landing page

## Automation

Initial cadence:
- GSC/GA4/Bing: daily
- Clarity Data Export: at most one daily call using a 3-day URL breakdown (well below the provider quota)
- URL inventory/sitemap crawl: daily
- URL Inspection: selective, not full-site daily
- IndexNow: event-driven on publish/update when practical
- weekly opportunity report: weekly GitHub Action

The scheduled collector must be idempotent.

## Buffer / social distribution integration

Do not store a Buffer key in source code.

Two supported paths:
1. ChatGPT/Buffer MCP via OAuth for interactive scheduling from ChatGPT.
2. Buffer personal API key in GitHub Actions Secrets for unattended workflows.

The unattended workflow should eventually support:

```
published article
  -> classify content
  -> generate channel-specific social copy
  -> create Buffer draft/scheduled post
  -> attach UTM parameters
  -> record distribution event
```

Review-first should remain the default until enough successful posts establish safe templates.

## Productization path

## Implemented collection notes

### Bing Webmaster

The collector uses Microsoft's JSON/HTTP endpoints at `https://ssl.bing.com/webmaster/api.svc/json/` with `BING_WEBMASTER_API_KEY` supplied only through the environment. Set `BING_SITE_URLS` to a comma-, semicolon-, or newline-separated list of the Main and Blog properties.

Per configured site it now collects `GetQueryStats`, `GetPageStats`, `GetCrawlStats`, `GetCrawlIssues`, `GetFeeds`, `GetLinkCounts`, and `GetUrlLinks`. It also calls `GetUserSites` once per run to record the current verified/unverified state without persisting verification tokens or other credentials. Backlink target counts and a bounded sample of referring URLs/anchor text are persisted in the daily Bing snapshot; the weekly report calculates directional backlink deltas between comparable snapshots.

The collector discovers the public sitemap for each StripUnion property. If the sitemap is missing from Bing's feed list and the property is verified, it submits the sitemap through `SubmitFeed` and re-reads the feed list. This is idempotent: already-present feeds are not resubmitted.

Keyword intelligence is collected with `GetKeywordStats` and `GetRelatedKeywords`. Seeds come from optional `BING_KEYWORD_SEEDS`, top observed first-party Bing queries, and a small strategic fallback set. Optional locale variables are `BING_KEYWORD_COUNTRY` (default `us`, normalized to lowercase because Bing's keyword endpoint expects a two-letter lowercase market code) and `BING_KEYWORD_LANGUAGE` (default `en-US`). Keyword data is planning evidence for the Growth Brain; it must not be copied into public articles as unsupported search-volume claims.

The snapshot is written to `data/raw/<date>/bing.json`; a failing site or optional method does not discard another source's valid data. Crawl stats update daily; query and page stats are documented as weekly-updated. `InIndex` from crawl stats is the available index-count signal; changes are directional comparisons between collected snapshots, not a complete index inventory. Bing may delay removal of repaired crawl issues by several days and does not expose a Google-style URL Inspection equivalent through this collector. The legacy POX/SOAP APIs are deliberately not used.

`scripts/check-bing-intelligence.mjs` is the automated acceptance gate. A healthy production snapshot requires both `stripunion.com` and `blog.stripunion.com` to be present and verified, their sitemap/feed state to be accepted, all seven site methods to succeed, backlink arrays to be structurally present (zero links is valid), and at least one keyword seed to complete both keyword methods.

The Growth Brain does not blindly accept every related keyword returned by Bing. It drops synthetic prompt fragments, generic head terms with no decision intent, and off-topic related-keyword collisions (for example generic wildlife/security/retail queries produced from ambiguous seeds). Accepted rows carry a relevance reason, content-state mapping, and a `recommendedUse` value so existing pages are refreshed instead of cannibalized by duplicate pages. `GetKeywordStats` time series are also reduced into rising/stable/falling planning signals; these are decision inputs, not public search-volume claims.


### Microsoft Clarity

The main site loads Clarity project `ysuowheiiz` only on production-indexable builds and passes analytics consent through Clarity Consent API V2. The WordPress Blog uses the official Clarity plugin plus its consent-management stack.

The optional first-party collector `src/collectors/clarity.mjs` uses Microsoft's Data Export endpoint with `CLARITY_API_TOKEN`. It makes one request per run with `numOfDays=3` and `dimension1=URL`, stores only the returned dashboard metrics in `data/raw/<date>/clarity.json`, and never logs or persists the token. This stays well below Clarity's project request quota.

Growth Brain combines Clarity friction signals with GA4 conversion evidence. Rage clicks, dead clicks, quickbacks, excessive scroll and error-click/script-error signals become measured UX/CTA investigation candidates. The system does not auto-redesign a page solely from one Clarity anomaly; it requires inspection and a measured experiment.

### Buffer performance

The Buffer collector discovers organizations and channels through the personal GraphQL API, selects the configured `BUFFER_CHANNEL_ID` when present (otherwise the X channel), and retrieves sent posts from the prior 90 days plus scheduled posts using cursor pagination. Set `BUFFER_SENT_DAYS` to adjust the lookback. Metrics are requested only for sent posts and retain each post's `metricsUpdatedAt`; Buffer refreshes post metrics daily, so they can lag the social network by about a day. Returned metric availability varies by network. The collector makes two paginated post queries and small organization/channel discovery queries per run.

The internal tool can later become a SaaS, but only after StripUnion validates that the system produces useful decisions.

### SaaS v1 candidate
- user connects Google Search Console
- user connects GA4
- optional Bing connection
- unified dashboard
- automated opportunity detection
- weekly AI action plan
- indexing monitor
- SEO anomaly alerts

### Differentiation from generic SEO dashboards
- action-oriented rather than report-oriented
- AI decides what changed and what to do next
- can write tasks back to GitHub/WordPress/Buffer
- combines search performance + site changes + conversion behavior
- lower-cost SMB/creator positioning

### Multi-tenant requirements later
- OAuth per customer
- encrypted credentials
- tenant isolation
- background job queue
- durable database
- billing
- usage limits
- audit logs
- privacy policy / data retention controls

Do not build these before internal validation.

## Implementation sequence

### M0 — bootstrap
- create project directory and package
- env schema / secret validation
- common API client utilities
- normalized output convention

### M1 — first-party collection
- GSC collector
- GA4 collector
- Bing collector
- site/sitemap collector

### M2 — storage + scheduled runs
- daily snapshot persistence
- GitHub Actions workflow
- retry/error reporting

### M3 — analysis
- ranking opportunity detector
- CTR opportunity detector
- decay detector
- cannibalization detector
- indexing/crawl detector

### M4 — commercial analytics
- affiliate_click event standard
- /go/... redirect standard
- campaign/subid model
- conversion/postback ingestion

### M5 — distribution
- Buffer integration
- UTM builder
- post generation queue
- review-first scheduling

## Success criteria before GSC Wizard trial ends

A useful internal replacement does not need every GSC Wizard feature.

Minimum acceptance:
- daily GSC/GA4/Bing collection runs without manual intervention
- data persists across runs
- one weekly report identifies actionable opportunities
- sitemap/indexing failures are surfaced
- source/landing-page performance is queryable
- credentials never appear in repository history
- failure of one source does not break all collectors

If these pass, StripUnion can defer the GSC Wizard subscription and continue building first-party capability.
