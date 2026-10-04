# Visual QA and Self-Healing

StripUnion uses browser-based visual QA in addition to HTML, SEO and HTTP health checks.

## What it detects

The Playwright oracle exercises representative pages at 320, 360, 375, 390, 412, 768 and 1440 pixel widths. It fails the workflow when it detects:

- document-level horizontal overflow;
- low text/background contrast in critical buttons, guide summary cards and guide tables;
- visible CTA buttons with no text;
- HTTP/browser failures.

Every run also stores full-page screenshots plus `visual-report.json` for 14 days.

## When it runs

- Pull requests and pushes that change site source, styles, the visual script or its workflow run against a local Astro production build before deployment.
- An hourly scheduled production run checks representative Main pages plus the Blog and AVCams homepages from a GitHub-hosted browser.

## Self-healing contract

A Visual QA failure is a `PRODUCTION_FAILURE` when it occurs on the production job and a pre-production regression when it occurs on a pull request. The hourly growth engine should read the machine-readable report, identify the smallest reversible CSS/layout fix, open a focused `codex/*` PR, rerun the visual gate and merge only after it passes.

Known safe repair patterns include:
- explicitly setting foreground colors on dark surfaces;
- explicitly setting text color on white/outlined buttons;
- adding `min-width:0` to grid/flex children that must shrink;
- keeping wide tables inside an `overflow-x:auto` container;
- adding `max-width:100%` and safe wrapping to article content;
- collapsing CTA/button groups to one column at narrow mobile widths.

Do not “fix” a visual problem by changing affiliate tracking, analytics identifiers, canonical URLs, robots directives, payment/legal settings or partner destinations.
