# StripUnion Migration Audit

## Source

Hostinger AI Builder Agentic export:

- Project id: `f5918aff-c2b5-47a1-aaec-33252d2e2e7b`
- Export format: React/Vite monorepo with a bundled PocketBase runtime and Hostinger Builder/editor runtime.

## Export inventory

Observed in the exported project:

- ~488 files
- ~40 MB unpacked
- ~32 MB is the bundled PocketBase executable alone
- ~3.8 MB is the remaining source/data after excluding that executable
- 68 public routes in the Builder route table
- 72 Builder page directories

## Confirmed legacy problems

Before migration cleanup, source inspection found:

- 27 references to the legacy `go.mavrtracktor.com` affiliate/tracking domain across 25 files
- only 5 references to the approved `go.whitetrafsa.com` destination
- 15 occurrences of the template phrase `Predict the future`
- 10 placeholder-description occurrences across 5 files
- Builder-specific ecommerce/cart/checkout runtime despite StripUnion being an affiliate publisher rather than a store
- bundled PocketBase runtime/database that is not required for the current editorial-affiliate model
- Hostinger visual-editor/session-journal runtime not needed in a normal production codebase

The earlier Hostinger Agentic edits did successfully remove the fake physical address/phone/email placeholders and replaced the broken header logo with a text wordmark, but the export still contained substantial template and legacy-link residue.

## Migration decision

The GitHub repository is the new source of truth.

We are not importing the Builder export byte-for-byte. Instead:

1. Preserve useful public URLs and editorial content.
2. Rebuild shared layout/components in a small maintainable React/Vite application.
3. Centralize affiliate destinations and disclosures.
4. Remove Builder/editor, ecommerce, PocketBase, and duplicate generated code that is not required.
5. Migrate existing useful editorial copy page-by-page after verifying it is not placeholder or fabricated content.
6. Deploy to a Hostinger Business Web App staging URL before moving `stripunion.com`.

## Current status

M0 repository bootstrap is in progress.

Already created:

- clean Vite/React project skeleton
- central Stripchat affiliate configuration
- responsive global layout
- homepage foundation
- generic editorial-review fallback
- trust/legal page foundation
- legacy-route registry
- Blog link targeting `https://blog.stripunion.com`

## Do not deploy to production yet

The current GitHub version is a migration foundation, not the finished production site. Core editorial content, metadata, sitemap/robots, analytics, and page-specific conversion work still need to be completed and validated.
