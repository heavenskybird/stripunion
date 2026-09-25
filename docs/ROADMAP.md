# StripUnion Commercial & Engineering Roadmap

## M0 — Codebase Stabilization

Goal: replace paid AI Builder edits with a maintainable GitHub source of truth.

Architecture: Astro static generation on Node.js 22, deployed from GitHub to Hostinger Business Web App.

Exit criteria:

- Astro build passes in CI
- no required PocketBase/ecommerce/Builder runtime
- approved affiliate URL centralized
- legacy public routes accounted for
- indexable pages contain no known template placeholders
- sitemap, robots and canonical output validated
- staging deploy succeeds
- mobile/desktop smoke test passes

## M1 — Core Conversion

Goal: make highest-intent pages commercially useful without misleading readers.

Priority:

1. Home
2. Live Cams hub
3. Stripchat review
4. Chaturbate review
5. LiveJasmin review
6. AdultFriendFinder review
7. VR / AR hub
8. VRPorn review
9. SexLikeReal review

Already implemented in the new architecture: 1–6.

Exit criteria:

- clear editorial vs commercial CTA distinction
- visible affiliate disclosure
- every `Try Stripchat →` uses the approved destination
- no button appears to visit another reviewed brand while redirecting to Stripchat
- page-specific conversion source is attached to affiliate CTA clicks
- responsive/mobile QA complete

## M2 — Technical SEO

Implemented foundation:

- unique title/meta framework
- canonical URL framework
- sitemap.xml
- robots.txt
- Organization/WebSite schema
- Article + Breadcrumb + FAQ schema on migrated reviews
- no fabricated rating schema
- static HTML generation

Remaining:

- validate output in deployed HTML
- inspect Core Web Vitals
- Search Console property + sitemap submission
- crawl test for broken internal links
- legacy redirect strategy
- blog/main-site reciprocal internal linking

## M3 — Commercial SEO Content Engine

Primary objective: grow search traffic that can feed an approved affiliate conversion path.

Current Live Cam revenue cluster:

- /best-live-cam-sites
- /best-free-live-cam-sites
- /stripchat
- /stripchat-pricing
- /stripchat-vs-chaturbate
- /stripchat-vs-livejasmin
- /chaturbate-alternatives
- /stripchat-alternatives

Next candidates should be prioritized by measurable search intent and monetization fit rather than content completeness.

Reusable types:

- Review
- X vs Y comparison
- Alternatives
- Pricing / cost explainer
- Best X category guide

Content should be data-driven rather than duplicated generated components.

## M4 — Blog Funnel

Connect `blog.stripunion.com` to main-site money pages.

Target path:

Search → Blog comparison/guide → Main-site review/category → Affiliate CTA → Partner

Actions:

- audit blog indexing
- add contextual links from existing comparison posts
- avoid duplicate thin `/blog` content on main domain
- create topic clusters that support commercial review pages

## M5 — Analytics & Affiliate Attribution

Current code already emits a `dataLayer` event for affiliate clicks with:

- affiliate partner
- affiliate source
- outbound URL

Planned source naming examples:

- homepage_hero
- homepage_featured_stripchat
- livecams_hero
- livecams_card_stripchat
- stripchat_top
- stripchat_bottom
- chaturbate_alternative_top
- blog_comparison

Before enabling analytics in production:

- choose GA4/GTM or another privacy-appropriate analytics setup
- document required cookie/consent behavior
- update Privacy Policy

## M6 — Traffic Growth

Only after tracking and conversion pages are stable:

- long-tail SEO expansion
- digital PR / quality link acquisition
- referral partnerships
- small paid adult-traffic experiments
- scale only after unit economics are measurable

## M7 — Multi-Affiliate Expansion

Apply to additional affiliate programs once StripUnion has credible content and traffic.

Replace temporary Stripchat alternative CTAs only after each platform-specific affiliate relationship is approved.
