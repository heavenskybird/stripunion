# StripUnion Migration Audit

## Source

Hostinger AI Builder Agentic export:

- Project id: `f5918aff-c2b5-47a1-aaec-33252d2e2e7b`
- Export format: React/Vite monorepo with bundled PocketBase and Hostinger Builder/editor runtime.

## Export inventory

Observed in the exported project:

- ~488 files
- ~40 MB unpacked
- ~32 MB is the bundled PocketBase executable alone
- ~3.8 MB is the remaining source/data after excluding that executable
- 68 public routes in the Builder route table
- 72 Builder page directories

## Confirmed legacy problems

Source inspection found:

- 27 references to the legacy `go.mavrtracktor.com` tracking domain across 25 files
- only 5 references to the approved `go.whitetrafsa.com` destination
- 15 occurrences of `Predict the future`
- 10 unfinished description placeholders across 5 files
- ecommerce/cart/checkout runtime despite an affiliate-publisher business model
- PocketBase runtime/database not required for the current product
- Hostinger visual-editor/session runtime not required in production

Earlier Agentic edits successfully removed fake address/phone/email placeholders and replaced the broken header logo with a text wordmark, but substantial residue remained.

## Architecture decision

The GitHub repository is now the source of truth.

The migration does not import Builder output byte-for-byte. Instead:

1. Preserve useful public URLs and editorial content.
2. Rebuild the site with Astro static generation.
3. Centralize affiliate destinations and disclosures.
4. Remove Builder/editor, ecommerce, PocketBase and duplicated generated markup.
5. Migrate useful editorial copy only after checking it for placeholders and unsupported claims.
6. Keep legacy URLs available while their canonical replacements are established.
7. Deploy to a Hostinger Business Web App staging URL before moving `stripunion.com`.

### Why Astro

StripUnion is primarily an SEO/editorial affiliate site. Static HTML provides stronger crawlability, lower client-side JavaScript, simpler hosting and better performance characteristics than the initial React SPA bootstrap.

Hostinger currently supports Astro in Business Web Hosting Node.js/Web App deployments.

## Current migrated surface

Implemented on branch `m0-astro-static`:

- static Astro architecture
- responsive shared layout
- centralized Stripchat affiliate URL
- affiliate click event hooks via `dataLayer`
- homepage conversion architecture
- Live Cams comparison hub
- full migrated review templates for Stripchat, Chaturbate, LiveJasmin and AdultFriendFinder
- primary-source links on the Chaturbate review
- affiliate disclosure, editorial policy, about, privacy, terms, disclaimer and 18+ pages
- canonical tags and robots directives
- Organization/WebSite/Article/Breadcrumb/FAQ structured data where applicable
- XML sitemap and robots.txt
- legacy route preservation with noindex/canonical handling
- GitHub Actions build validation

## Current build state

A GitHub Actions build succeeded after the Astro conversion and CI configuration correction. Further changes must continue to pass build validation before merge to `main`.

## Production status

Do not move `stripunion.com` yet.

Remaining before staging approval:

- migrate the next priority review/category pages
- visual QA on a real Hostinger staging deployment
- verify generated sitemap/canonical output
- configure a real contact mailbox before making Contact indexable
- decide analytics/consent implementation
- validate redirects or replacement strategy for legacy URLs
