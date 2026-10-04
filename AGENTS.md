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

## Growth operating policy
- Treat growth as a system, not a content-only problem. Daily diagnosis should consider acquisition, keyword/search visibility, content architecture, visual quality, internal linking, UX/CRO, social/community distribution, affiliate offer coverage, technical SEO/indexation, performance, trust/compliance, creator/model referral opportunities, and monetization/revenue attribution.
- Daily learning may produce daily publishing. Use the freshest competitor, GSC, GA4, Bing, Buffer, WordPress, and affiliate evidence to select and improve publish candidates, but never mass-publish thin, duplicative, unsupported, or cannibalizing pages.
- While the content gap is large, inspect the live WordPress draft inventory through WPWriter when available and publish as many high-value, non-duplicate, non-cannibalizing candidates as pass the quality and factual gates; normally aim for several strong posts per day rather than imposing a fixed 1–3 ceiling. Cannibalization should trigger merging, retargeting, or dropping overlapping drafts—not a general pause in publishing. Preserve a separation between low-risk new-content output and edits to established pages.
- During the current site-build phase, content construction and publication come before passive traffic analysis. Zero clicks, low impressions, or an immature data sample are never reasons to wait before building additional high-quality search surfaces. A daily cycle should first publish or materially advance the best candidates, then use analytics to choose the next cycle.
- Maintain broad category coverage rather than overfitting to live cams. Rotate publishing across the repository taxonomy—Live Cams, VR/AR, Adult Games, Hentai/Anime, Dating/Hookups, Premium Videos, Free Videos, Adult Shops—and adjacent creator/model, webmaster/affiliate, privacy/safety/payment/mobile intents. Until every major category has a useful canonical hub plus distinct supporting pages, under-built categories receive explicit priority.
- Do not thrash existing published pages based on one-day noise. Evaluate meaningful page/CTA/SEO experiments over 7/14/30-day windows where data permits, and record winner/loser/inconclusive learnings so future decisions reuse validated patterns.
- Distribution should expand with the unique content pool: work toward up to 20 materially distinct X posts/day and up to 100 materially distinct Telegram posts/day, spaced across the day. Never fill quotas with duplicate wording, keyword stuffing, unsolicited replies/DMs, or filler.
- GSC Wizard, Ahrefs, and Semrush are excluded from the core growth stack. Prefer direct/official/free/open sources: GSC API, GA4 Data/Admin, Bing Webmaster, Google Trends/Keyword Planner when accessible, Common Crawl, public competitor pages/sitemaps/robots, public SERPs, and PageSpeed/Lighthouse/CrUX.
- Competitor intelligence is for strategy learning, not copying. Learn taxonomy, page types, visual patterns, CTA structures, update cadence, offer coverage, internal-link systems, and topic expansion while never republishing competitor text, images, or proprietary assets.
- Creator/model acquisition remains referral-only unless explicitly changed by the user. Do not create studio/agency, KYC-custody, creator payroll, or exclusivity workflows.

## Documentation maintenance
- Keep this file concise and limited to stable, cross-project rules. Put detailed architecture, runbooks, credentials setup, source-specific cadence/limitations, and volatile operational status in the appropriate `docs/` files.
- When instructions conflict, follow the user's current explicit request and current repository state; preserve safety rules for credentials and user data.