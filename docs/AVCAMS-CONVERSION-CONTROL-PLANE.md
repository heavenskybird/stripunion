# AVCams Conversion Control Plane

Updated: 2026-10-02

## Operating model

StripUnion and the StripUnion Blog are acquisition and intent-classification surfaces. AVCams is the primary StripCash/Stripchat white-label conversion destination.

```
Search / social / community
        ↓
StripUnion / StripUnion Blog
        ↓
StripCash official tracking layer
        ↓
AVCams
        ↓
member registration / purchase / rebill / model referral
```

Do not send normal viewer traffic to the generic Stripchat destination. Preserve StripCash's official affiliate attribution by keeping `userId` on every generated tracking URL and setting `targetDomain=avcams.online`.

## Tracking contract

The site-level CTA builder owns the stable parameters:

- `userId`: StripCash affiliate identity.
- `campaignId`: coarse StripUnion page-intent family.
- `creativeId`: normalized CTA label/creative identifier.
- `sourceId`: StripUnion source identity.
- `p1`: source page key.
- `p2`: CTA placement.
- `targetDomain`: `avcams.online`.
- `path`: AVCams destination path.

At click time, the browser adds:

- `memberId`: unique click ID used to reconcile future StripCash postbacks with the original click.
- `p3`: first-touch acquisition source such as Google, Bing, StripUnion Blog, direct, or referral.

Do not rewrite, remove, or replace StripCash's `userId`. StripCash parameters are case-sensitive.

## Current destination policy

- Viewer traffic: AVCams, default `/girls`.
- Model-referral traffic: AVCams `/signup/model`.
- Studio signup: do not promote; there is no affiliate commission.
- Affiliate/webmaster referral: use the dedicated StripCash referral URL `https://stripcash.com/sign-up/stripunion`; this is a separate funnel from AVCams viewer/model traffic.
- Third-party review traffic may keep acquisition-oriented SEO pages, but commercial live-cam CTAs should convert through AVCams.

Page-specific category, model-room, filter, and Magic Search routing should be added only when the destination path/route has been verified against current StripCash documentation or the live AVCams white label.

## StripCash Service menu

### Postback Setup

Purpose: configure server-to-server conversion callbacks.

Relevant AVCams events:
- Member registration
- Member verification
- First purchase
- Rebill / all purchase
- First transaction
- First subscription / subscription rebills when useful
- Refund / chargeback for reconciliation
- Model registration
- Model bonus reached
- Age verification if useful for funnel diagnostics

The callback should carry at least:
`memberId`, `campaignId`, `creativeId`, `sourceId`, `p1`, `p2`, `p3`, `amount`, `revenue`, `device`, `transactionId`, `transactionType`, and `userChannel`.

Do not configure production postbacks until a private receiver and durable private storage exist. The public GitHub repository must never store raw transaction-level postback payloads.

### Postbacks Log

Purpose: operational verification after setup. Use it to confirm StripCash emitted the expected event, inspect delivery success/failure, and reconcile missing conversions.

### Statistics API keys

Purpose: authorize read-only Statistics API collection.

Endpoint documented by StripCash:
`https://api.stripcash.com/external/v1/user/statistics?userId={userId}`

The bearer token is secret. Store it only in a secret manager such as GitHub Actions Secrets or the eventual private analytics runtime. Never commit it.

Because this repository is public, do not commit raw Statistics API responses. Only persist privacy-safe aggregated metrics after the exact response schema and filters have been validated.

### API for Domain

Purpose: authorize the Models API for Aggregators for one approved domain.

This is not required for the current AVCams routing/postback milestone. Use it only when StripUnion deliberately adds live model listings/player aggregation. The aggregator API requires its domain-specific key, geoban handling, data lifecycle controls, and rate-limit compliance.

## Revenue funnels

### Viewer funnel

```
visitor → AVCams click → member registration → verification → first purchase → rebill → affiliate revenue
```

### Model funnel

```
creator visitor → AVCams /signup/model → model registration → model bonus reached → referral revenue
```

### Affiliate-referral funnel

```
webmaster/affiliate visitor → stripcash.com/sign-up/stripunion → referred affiliate earnings → 5% lifetime referral earnings
```

Studio signup is intentionally excluded from growth targets.

## Delivery phases

### G1A — routing and click identity

- Make AVCams the default live-cam conversion destination.
- Preserve StripCash `userId`.
- Add `targetDomain=avcams.online` and explicit destination path.
- Generate unique `memberId` on every outbound conversion click.
- Keep GA4 `affiliate_click` telemetry for acquisition diagnostics.

### G1B — conversion ingestion

- Deploy a private postback receiver.
- Store transaction-level events privately.
- Configure AVCams-specific StripCash postbacks.
- Verify in Postbacks Log.
- Add privacy-safe funnel aggregates to the weekly growth report.

### G1C — Statistics reconciliation

- Validate Statistics API filters/groups against the live account.
- Add the Statistics API token as a secret.
- Pull aggregate totals for reconciliation.
- Do not store raw transaction-level API responses in this public repository.

### G2 — live discovery

- Consider Online Models / Aggregators API only after G1 attribution is stable.
- Start with a bounded live-now module before building large model directories.
- Respect geobans, image-hosting restrictions, model deletion rules, and API rate limits.
