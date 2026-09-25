# StripUnion

StripUnion is an independent adult-platform review, comparison, and discovery website for adults 18+.

## Source of truth

This GitHub repository is the canonical source for the post-Hostinger-AI-Builder version of StripUnion.

The original Hostinger AI Builder export is retained as migration source material only. We preserve useful editorial content and public URLs while removing Builder-specific runtime, unused ecommerce/PocketBase code, template residue, and duplicated page markup.

## Architecture

- Astro 7 static site generation
- Node.js 22 build environment
- No database required for the current editorial/affiliate model
- Centralized affiliate configuration
- Data-driven review/category pages
- Static HTML output for crawlability and performance
- GitHub Actions build validation
- Planned deployment: Hostinger Business Web App from GitHub

Astro was selected over the initial React SPA bootstrap because StripUnion is primarily a content/SEO site. Static generation gives every indexable page server-ready HTML without requiring client-side rendering.

## Commercial model

SEO / editorial discovery → reviews & comparisons → clearly disclosed affiliate CTA → partner site.

Current approved Stripchat / StripCash affiliate destination is managed centrally in `src/config/site.js`.

## Development principles

- Preserve useful existing URLs where practical.
- No fabricated ratings, testimonials, traffic claims, prices, or testing claims.
- Separate editorial links from commercial affiliate CTAs.
- Keep affiliate relationships clearly disclosed.
- Prefer primary sources for volatile platform facts.
- Optimize for crawlability, performance, accessibility, and mobile UX.
- Build must pass before deployment.
- `main` becomes the deployment branch only after migration QA.

## Current status

Development branch: `m0-astro-static`

M0 codebase stabilization and M1 core conversion migration are in progress. Do not point `stripunion.com` to this repository until staging QA is complete.
