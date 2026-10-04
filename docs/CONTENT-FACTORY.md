# StripUnion Content Factory

## Status

WPWriter is deprecated from the production critical path. It may remain connected temporarily for read-only CMS inspection or ad-hoc noncritical assistance, but hourly production must not depend on its credits, concurrency, images, model choice or publish action.

The canonical machine-readable policy is `ops/editorial/tooling-policy.json`.

## Provider-neutral contract

Content workers do not publish directly. They emit validated JSON artifacts under:

`ops/editorial/content-artifacts/*.json`

An artifact contains:
- backlog item ID;
- canonical slug and category;
- SEO title/description/excerpt;
- key takeaways;
- structured sections, tables and checklists;
- FAQs;
- evidence metadata describing whether any volatile claims exist and which official sources support them.

The content worker may be ChatGPT or another policy-compatible provider. No specific model is a required dependency. Provider choice is an implementation detail governed by quality, cost, latency, reliability, policy compatibility and language quality.

## Deterministic compiler

`scripts/compile-editorial-artifacts.mjs` validates artifacts before turning them into Astro guide modules.

Quality checks include:
- known category;
- clean slug;
- at least 650 substantive words;
- at least four key takeaways;
- at least five substantive sections;
- a useful table or checklist;
- at least three FAQs;
- official source requirement whenever an artifact declares volatile claims;
- rejection of a small set of unsupported guarantees/superlatives.

Run:

`npm run check:editorial-artifacts`

Compilation:

`npm run compile:editorial-artifacts`

## Batch publication

`.github/workflows/editorial-batch-publish.yml` is the first autonomous batch consumer.

When approved content artifacts land on `main`, the workflow:
1. validates all artifacts;
2. compiles them into `src/data/guides/*.js`;
3. commits generated guide modules back to `main`.

That generated-guide commit enters the existing Astro build/deploy path. The existing editorial distribution workflow waits for each production URL to return HTTP 200, distributes to Buffer/X and Telegram, and then records a machine-readable publication ledger under:

`ops/editorial/publication-ledger/astro/*.json`

This makes rolling 24-hour production measurable without relying on WordPress date fields or chat memory.

## Execution boundary

The publishing plane is deterministic CI/CD:

`backlog -> provider-neutral artifact -> compiler -> CI -> main -> Hostinger -> live URL -> distribution -> ledger`

A chat connector is not required to click Publish. This removes WPWriter and chat-level external write actions from the runtime critical path while preserving repository review, CI checks and production verification.

## Safety and editorial scope

The content factory is designed for non-explicit adult-industry decision support: reviews, comparisons, platform selection, privacy, payments, safety, devices, creator economics and webmaster/affiliate education. It does not require explicit erotic prose to create commercially useful search surfaces.

Do not use alternate providers to evade a platform safety decision. Alternate providers are reliability/quality workers and must be used only for workloads compatible with their current terms and policies.


## Rolling production accounting

`scripts/editorial-production-count.mjs` combines the Astro and WordPress publication ledgers into a rolling production count. The hourly workflow `.github/workflows/editorial-production-snapshot.yml` writes a machine-readable 24-hour snapshot artifact, including the count, source split and remaining units against the 120/day objective.

## One-time GitHub repository setting

The first production run proved that compilation can create and push a governed `bot/editorial-batch-*` branch, but the repository currently prevents `GITHUB_TOKEN` from creating pull requests. GitHub Actions therefore cannot complete the branch -> PR handoff until the repository setting **Allow GitHub Actions to create and approve pull requests** is enabled under **Settings -> Actions -> General -> Workflow permissions**.

Until that one-time setting is enabled, the autonomous control plane can still create the PR through the authenticated GitHub connector, as was done for the first batch. Do not replace this with direct generated-content pushes to `main`; keep PR + CI governance.
