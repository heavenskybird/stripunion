# StripUnion first-party click-to-postback attribution

Updated: 2026-10-03

## Objective

Join a StripUnion AVCams outbound click to the later StripCash conversion event with the same `memberId`.

This closes the measurement path:

`landing page / source -> AVCams click -> memberId -> StripCash postback -> conversion type / revenue -> page-level performance`

## What is already implemented

### Browser click ingestion

Every AVCams affiliate click generates a unique `memberId` and sends a privacy-minimized first-party event to:

`https://stripunion-live-models.stripunion.workers.dev/events/click`

Stored click fields are limited to attribution metadata:

- memberId
- StripUnion page path
- affiliate source
- acquisition source
- campaign / creative / source IDs
- p1 / p2 / p3
- AVCams target domain and destination path

No email, account credential, message content, payment card data, or model API secret is accepted by the click normalizer.

### Attribution storage

A dedicated Cloudflare Durable Object class `AttributionStore` stores click records for 30 days and maintains aggregate counters by:

- p1
- affiliate source
- postback event type
- revenue currency

Raw click and event records are expired automatically; aggregate counters remain available for growth reporting.

### StripCash postback receiver

Prepared endpoint:

`https://stripunion-live-models.stripunion.workers.dev/postback/stripcash`

The endpoint accepts GET or POST, but remains disabled until the Worker receives the secret:

`STRIPCASH_POSTBACK_SECRET`

The secret may be supplied to StripCash as a query parameter named `token`. It is removed before payload normalization and is never stored.

The receiver deliberately stores only normalized non-PII fields:

- memberId
- event type
- revenue/commission amount when supplied
- currency when supplied
- transaction ID when supplied

Unknown/raw postback fields are not persisted.

### Private summary endpoint

`GET /analytics/summary`

Requires:

`Authorization: Bearer <STRIPCASH_POSTBACK_SECRET>`

The daily SEO/growth pipeline has a collector ready to ingest this aggregate summary as `attribution.json` once the same GitHub secret is configured and deployed to the Worker.

## Remaining human setup

1. Create a strong random secret locally. Do not paste it into chat.
2. Add it as GitHub Actions repository secret:
   `STRIPCASH_POSTBACK_SECRET`
3. Open StripCash -> Service -> Postback Setup -> Add postback.
4. Before saving the first rule, capture the Add postback form including:
   - URL field
   - website selection
   - postback type options
   - method options
   - available macro/parameter placeholders
   - revenue-only option
5. Use the exact StripCash placeholders shown in that form/documentation to construct the final receiver URL. Do not guess macro names.
6. After the receiver is configured, use Postbacks Log to validate a real or supported test event.

## Do not do

- Do not send email, username, IP address, payment details or other unnecessary personal fields in the postback URL.
- Do not remove `memberId` from outbound StripCash tracking links.
- Do not expose `STRIPCASH_POSTBACK_SECRET` in browser code or commit it to Git.
- Do not infer page-level revenue from aggregate StripCash statistics before memberId joining is confirmed.
