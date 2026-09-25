# StripUnion

StripUnion is an independent adult-platform review, comparison, and discovery website for adults 18+.

## Source of truth

This repository is the canonical source for the post-Hostinger-AI-Builder version of StripUnion.

The original Hostinger AI Builder export is retained outside this repository as a migration source. The production migration preserves useful editorial content and public URLs while removing Builder-specific runtime, unused ecommerce/PocketBase code, and template residue.

## Commercial model

SEO / editorial discovery → reviews & comparisons → clearly disclosed affiliate CTA → partner site.

Current approved Stripchat / StripCash affiliate destination is managed centrally in the application configuration rather than duplicated across pages.

## Development principles

- Preserve existing useful URLs where practical.
- No fabricated ratings, testimonials, traffic claims, prices, or testing claims.
- Separate editorial links from commercial affiliate CTAs.
- Keep affiliate relationships clearly disclosed.
- Optimize for crawlability, performance, accessibility, and mobile UX.
- Changes must build successfully before deployment.
- `main` is the deployment branch after migration is validated.

## Migration status

M0 — repository bootstrap and codebase stabilization: in progress.
