# StripCash Attribution — StripUnion

## Objective

Connect StripUnion traffic, page intent and CTA placement to StripCash downstream outcomes so growth decisions are based on revenue rather than click volume.

## Confirmed StripCash parameter names

Confirmed from the account owner's Link Builder output and StripCash documentation:

- `userId` — affiliate account identifier
- `campaignId` — user-defined campaign identifier
- `creativeId` — user-defined creative identifier
- `sourceId` — user-defined source identifier
- `p1`, `p2`, `p3` — custom tracking parameters

The supplied Link Builder test generated:

`campaignId=su_test&sourceId=stripunion&userId=...`

StripCash Statistics supports grouping by Campaign, Creative, Source, Custom parameter #1, #2 and #3, as well as referrer, geography, device and calendar dimensions.

## Production taxonomy

Every Stripchat affiliate CTA now sends:

- `campaignId` = content / commercial-intent family
- `creativeId` = normalized CTA copy
- `sourceId=stripunion`
- `p1` = current StripUnion page
- `p2` = CTA placement
- `p3` = first-touch acquisition source, attached at click time

### campaignId examples

- `su_home`
- `su_livecam_review`
- `su_livecam_comparison`
- `su_livecam_pricing`
- `su_livecam_alternatives`
- `su_livecam_best`
- `su_livecam_hub`
- `su_crosssell`

### p1 examples

- `homepage`
- `stripchat`
- `stripchat-pricing`
- `stripchat-vs-chaturbate`
- `chaturbate-alternatives`

### p2 examples

- `homepage_hero`
- `stripchat_top`
- `stripchat_mid`
- `stripchat_bottom`
- `stripchat_pricing_hero`
- `chaturbate_alternatives_bottom`

### p3 examples

- `google`
- `bing`
- `duckduckgo`
- `stripunion_blog`
- `direct`
- `utm_<source>`
- `ref_<hostname>`

The first acquisition source is stored for the browser session so internal navigation does not overwrite the original source before the affiliate click.

## Staging isolation

Clicks from `*.hostingersite.com` are deliberately rewritten at click time to:

- `campaignId=su_staging_test`
- `sourceId=stripunion_staging`
- `p3=qa`

This keeps QA clicks out of the production performance groups.

## Recommended StripCash report

Use Statistics with Source filtered to `stripunion`.

Suggested nested Groups:

1. Campaign
2. Custom parameter #1
3. Custom parameter #2
4. Custom parameter #3
5. Creative

This answers:

```
commercial intent
→ page
→ CTA placement
→ acquisition source
→ CTA copy
→ clicks / signups / first purchases / revenue
```

## Business KPI hierarchy

The account currently uses 20% RevShare.

Optimize in this order:

1. Scheme earnings / revenue
2. First purchases
3. Signup → first-purchase conversion rate
4. Verified signups
5. Signups
6. Affiliate CTR

CTR is diagnostic. Revenue is the objective.

## Postbacks

Do not add a server-side postback receiver yet.

Statistics already exposes the dimensions required for early optimization. Add postbacks when traffic volume is meaningful enough that automated event joining or paid-media optimization justifies additional infrastructure.
