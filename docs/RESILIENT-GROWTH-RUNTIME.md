# Resilient Growth Runtime

## Purpose

The hourly growth engine must keep operating when one observation or write path is unavailable. A tool failure is not automatically a production failure, and a connector permission failure is not the same thing as a platform safety decision.

## Blocker taxonomy

Use exactly these operational classes:

- `WEB_FETCH_LIMITATION`: the chat/web retrieval layer cannot access a production URL. This is not evidence that the site is down. Use the GitHub Actions public-health oracle as the production-health source of truth.
- `CONNECTOR_PERMISSION_BLOCKER`: an external provider or connector denies an otherwise allowed operation because authentication, OAuth scope, app permission, repository permission or provider-side authorization is insufficient.
- `PLATFORM_SAFETY_BLOCKER`: the runtime declines an external action under its safety controls even though the destination connector may otherwise have permission. Do not try to disable or evade the safety layer. Continue only through other normal, authorized paths that are independently allowed.
- `PRODUCTION_FAILURE`: a production endpoint, build, deploy, canonical/indexability check, distribution path or first-party publisher actually fails. Treat this as a real reliability incident and self-heal when low risk.

Do not collapse these classes into a generic "connector problem."

## Production health oracle

Chat-level web fetch is optional evidence. It is not the production-health authority.

The repository workflow `.github/workflows/two-site-health.yml` runs from GitHub-hosted infrastructure and is the canonical external network health probe. It includes:

- the existing detailed Main health check;
- the existing detailed WordPress Blog health check;
- a lightweight ecosystem oracle covering `stripunion.com`, `blog.stripunion.com` and `avcams.online`;
- a machine-readable `public-health-oracle.json` workflow artifact.

The ecosystem oracle records HTTP reachability, final host, canonical/noindex observations, robots behavior and sitemap observations. AVCams is upstream-managed, so missing canonical/sitemap evidence is recorded as a warning unless and until its upstream behavior is formally controlled by StripUnion.

If chat-level web fetch fails but the GitHub health oracle passes, classify the condition as `WEB_FETCH_LIMITATION`, not `PRODUCTION_FAILURE`.

## Editorial workload control plane

The structured backlog is `ops/editorial/hourly-backlog.json`.

It carries:

- 5/hour and 120/rolling-24h targets;
- current category/intent queue;
- source-verification requirements;
- approved monetization constraints;
- blocker taxonomy;
- fallback ladder.

CI validates the backlog so malformed queue state cannot silently become operational truth.

The backlog is workload metadata, not publication content. Production article bodies continue to use the established GitHub/Astro guide modules or WordPress queue JSON payloads and must pass the existing quality gates.

## Fallback ladder

When an allowed action path is unavailable, try the next normal first-party path only when the action itself remains allowed:

1. GitHub structured write on a focused `codex/*` branch.
2. Existing first-party WordPress editorial queue and publisher.
3. Existing repository-managed publication manifest/workflow.
4. Produce a validated patch/content bundle for the next authorized execution path.
5. Record the precise blocker class and carry the publication deficit forward.

The ladder exists to remove accidental tool coupling. It must never be used to bypass a platform safety decision about content or an action itself.

## Permission model

Repository delivery remains:

`codex/* -> PR -> CI -> merge -> production verification`

Do not weaken branch protection or push directly to `main` to increase throughput. Connector permissions and runtime safety controls are separate layers; granting a connector broad write permission does not guarantee every write action will be permitted in every context.

## Hourly reporting

When a deficit occurs, report the actual blocker class and the fallback attempted. Examples:

- `WEB_FETCH_LIMITATION`: no publication deficit by itself; use the health artifact.
- `CONNECTOR_PERMISSION_BLOCKER`: identify the missing permission and ask Kenny only if it cannot be repaired autonomously.
- `PLATFORM_SAFETY_BLOCKER`: do not ask Kenny to weaken safety settings; use another independently allowed normal path or carry the deficit.
- `PRODUCTION_FAILURE`: repair, re-run acceptance, and report the incident and fix.
