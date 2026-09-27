# StripUnion project instructions

## Source of truth and scope
- Treat the current Git checkout, tracked files, and repository documentation as project truth. Inspect `git status`, the current branch, and recent history before making changes; do not infer state from old chat, generated reports, or stale status notes.
- Read `README.md` and the relevant material in `docs/` before changing site behavior. For analytics or automation work, read `docs/SEO-DATA-LAYER.md`, `docs/AUTOMATION-SETUP.md`, the applicable workflow files, and the relevant integration README/source.
- Keep StripUnion an independent adult-platform review, comparison, and discovery website for adults 18+. Preserve useful public URLs and existing editorial intent.
- Keep changes focused. Do not rewrite unrelated production pages or introduce paid infrastructure or public SaaS/multi-tenant features without an explicit request.
- The repository is the canonical source for the current Astro site. Do not treat the legacy Hostinger AI Builder export as the runtime or current architecture.

## Content and product integrity
- Do not fabricate ratings, testimonials, traffic claims, prices, product capabilities, or testing claims.
- Use primary sources for volatile platform facts and verify facts that can change.
- Keep editorial links distinct from affiliate CTAs and clearly disclose affiliate relationships.
- Optimize for crawlability, performance, accessibility, and mobile usability.
- Keep affiliate destinations centralized in the existing configuration; do not scatter partner URLs through pages.

## Architecture and quality
- The site uses Astro static generation and Node.js 22. Follow existing project patterns and avoid adding dependencies unless needed.
- Run `npm run check`, `npm run build`, and `npm run check:prod-seo` for relevant site changes. The production SEO check follows a production-indexable build with `PUBLIC_ALLOW_INDEXING=true`; staging builds must retain their safe noindex behavior.
- For SEO data-layer changes, inspect and run the relevant scripts in `ops/seo-data-layer/package.json`; keep collectors idempotent and preserve successful source snapshots when another source fails.
- Keep GitHub Actions workflows least-privileged, explicit about per-source outcomes, and safe for scheduled and manually dispatched runs. Serialize concurrent jobs that write shared snapshots or reports.
- Do not commit `node_modules/`, npm caches, build output, local environment files, or generated files unless the task explicitly requires tracked output. Check `git status` before committing.

## Credentials and external services
- Never expose, print, commit, or place credentials in source, logs, issues, pull requests, reports, or chat. Read credentials only from the designated environment variables or GitHub Actions Secrets.
- Never echo full API request URLs when they may contain a key/token. Avoid logging request headers, secret-bearing payloads, or credential-store contents.
- Keep account identifiers and endpoint configuration in repository variables or existing configuration where appropriate; do not hard-code sensitive values.
- Handle each data provider independently. Report failures clearly without deleting valid snapshots from other providers; skip optional collectors cleanly in local development when credentials are absent.
- Before using an external API, follow its current official documentation and the limitations/cadence recorded in the relevant repository docs.
- When work concerns OpenAI APIs, Codex, ChatGPT, plugins, MCP, or OpenAI product configuration, use the official OpenAI Developer Docs MCP as the preferred documentation source rather than relying on stale model knowledge.

## Git and delivery
- Preserve the user's working tree and staged changes. Never reset, restore, discard, or rewrite user changes unless explicitly asked.
- Use a focused `codex/` feature or repair branch for changes. Do not push directly to `main`; use a pull request, inspect required checks, and merge only after the checks pass.
- Publishing tracked StripUnion content to the configured canonical origin `heavenskybird/stripunion` through focused `codex/*` branches and pull requests is an authorized routine delivery action. If direct Git transport is unavailable, use the authenticated GitHub connector/Git Data API as the preferred fallback rather than asking Kenny to relay commits manually. This authorization does not extend to other repositories, new remotes, direct pushes to `main`, secrets, unrelated local files, or destructive history rewrites.
- Rebase or merge against current `origin/main` only after inspecting history and resolving conflicts only when their intent is unambiguous. Stop and report genuinely ambiguous semantic conflicts.
- After merging, synchronize local `main`, verify the relevant post-merge workflows, and finish with a clean/accurately reported Git status.
- Keep commits focused and use a concise conventional commit message that describes the change.

## Documentation maintenance
- Keep this file concise and limited to stable, cross-project rules. Put detailed architecture, runbooks, credentials setup, source-specific cadence/limitations, and volatile operational status in the appropriate `docs/` files.
- When instructions conflict, follow the user's current explicit request and current repository state; preserve safety rules for credentials and user data.
