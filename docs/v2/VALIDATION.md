# Validation

2026-10-25, Node.js 22.23.4. All work performed on codex/keyword-intelligence-v0.

| Check | Result |
|---|---|
| V0 sanitized unit tests, direct node execution | 7/7 passed; Unicode, NULL/zero, Domain/Blog/AVCams scope, overlapping collection dedup/conflicts, Bing no page/volume invention, score explanations/validation |
| Existing R1 + editorial generator guards | 33/33 passed; no real provider/publishing calls |
| Existing SEO data-layer suite | 14/14 passed |
| npm run check | Passed, 979 source/public files |
| Staging-safe local build | Passed, 1009 pages, PUBLIC_ALLOW_INDEXING=false |
| Staging robots artifact | Passed, User-agent:* / Disallow:/ |
| Production-indexable local build | Passed, 1009 pages; PUBLIC_ALLOW_INDEXING=true, test GA4 ID only |
| npm run check:prod-seo | Passed; local production artifact only, no upload |
| Historical snapshot CLI | Passed, 100 observations; checked-in example is explicitly limited to five |
| git diff --check | Passed before delivery |

The initial R1 suite hit child_process EPERM under the default sandbox; a normal additional-permissions rerun passed all 33. The initial build hit Astro telemetry trying to create a home config directory; disabling telemetry for the command resolved it. No HOME/CODEX_HOME was changed, no credentials were printed, and no production source was changed to work around the runner.

No live collector, production generation, workflow dispatch/rerun, Hostinger write, Supabase query/migration, receipt/checkpoint edit, publication, social send, DNS or payment operation was performed. Local production-indexable HTML is a test artifact, not a deployment.

A passing local suite establishes offline behavior only. Hostinger account API authorization, current collector credentials, live SERP correctness, Ads/Trends access and autonomous recovery remain unverified. PR checks are reported separately in delivery notes; no merge is authorized by this task.
