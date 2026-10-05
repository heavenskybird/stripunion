# StripUnion Automation Setup

This checklist contains the manual account-level actions required to turn the current code into an unattended event-driven workflow.

## 1. Buffer personal API key

Buffer Settings -> API -> Personal Access -> New Key.

Recommended:
- Name: StripUnion GitHub Actions
- Expiration: 1 year
- Permissions:
  - postsRead
  - postsWrite
  - insightsRead

Do not paste the key into Git or chat.

Save it in GitHub:
Repository -> Settings -> Secrets and variables -> Actions -> Secrets -> New repository secret

Name:
`BUFFER_API_KEY`

Value:
the full Buffer key

The connected X channel ID is not secret.

Create a repository variable:
Repository -> Settings -> Secrets and variables -> Actions -> Variables -> New repository variable

Name:
`BUFFER_CHANNEL_ID`

Value:
`6ab75d92ea19ca0bdef12700`

## 2. Google service account for unattended GSC + GA4 collection

Create or select one Google Cloud project.

Enable:
- Google Search Console API
- Google Analytics Data API

Create a service account and a JSON key.

Grant the service-account email read access to:
- Google Search Console property: `sc-domain:stripunion.com`
- GA4 property: StripUnion-Media1 / property ID `530171093`

Save the complete downloaded JSON object as a GitHub Actions secret:

`GOOGLE_SERVICE_ACCOUNT_JSON`

Do not commit the JSON file.

Create repository variables:

`GSC_SITE_URL` = `sc-domain:stripunion.com`

`GA4_PROPERTY_ID` = `530171093`

## 3. WordPress -> GitHub event trigger

Goal:
published WordPress post -> GitHub Actions -> Buffer -> X.

A webhook plugin with configurable Bearer authentication and JSON body mapping is required.

Preferred current option:
`RT Connect Webhooks` (WordPress.org slug: `rt-connect-webhooks`).

Create a GitHub fine-grained personal access token dedicated only to dispatching this repository workflow.

Recommended token:
- Name: StripUnion WordPress Dispatcher
- Repository access: only `heavenskybird/stripunion`
- Repository permissions: Actions = Read and write
- Expiration: 1 year

Do not put the Buffer API key in WordPress.

Configure the WordPress webhook to call:

`POST https://api.github.com/repos/heavenskybird/stripunion/actions/workflows/social-distribution.yml/dispatches`

Authentication:
`Authorization: Bearer <dedicated GitHub token>`

Headers:
- `Accept: application/vnd.github+json`
- `X-GitHub-Api-Version: 2022-11-28`
- `Content-Type: application/json`

Body shape:

```json
{
  "ref": "main",
  "inputs": {
    "title": "<published post title>",
    "url": "<published post permalink>",
    "excerpt": "<post excerpt>",
    "post_id": "<WordPress post ID>",
    "source": "wordpress"
  }
}
```

Use the plugin's field mapper rather than hard-coding placeholder syntax from this document; exact variable names depend on the plugin UI.

Trigger:
- post published
- post type: post
- do not fire for every post update in v0

## 4. Bing

The current GSC Wizard Bing key is not automatically available to GitHub Actions.

When the first-party Bing collector is added, save the Bing Webmaster API key as:

`BING_WEBMASTER_API_KEY`

Do not paste it into chat or source code.

## 5. Optional AI decision layer

The first unattended version is intentionally deterministic:
publish event -> classify content -> create tracked social copy -> add to Buffer queue.

Later, if autonomous copy selection, content scoring and decision-making should run outside ChatGPT sessions, add a server-side model API credential (for example an OpenAI API key) as a GitHub secret.

This is separate from a ChatGPT subscription and should only be added when the rule-based workflow is stable.

## Safety / operating rules

- No secrets in repository files, issues, pull requests, WordPress post bodies or chat.
- Use minimum permissions.
- Use dedicated credentials per integration.
- Prefer long-lived but revocable keys for production automation.
- Keep social publishing review-free only for templates that have already passed testing.
- Never mass-post identical promotional content across communities.

## Bing Webmaster site variable

Create repository variable BING_SITE_URLS with comma-separated verified site URLs (for example the main and blog properties). Keep the API key in BING_WEBMASTER_API_KEY Actions Secret only.


## 6. Microsoft Clarity

Main-site Clarity is deployed from the Astro layout and is gated by production indexing. The public project ID is:

`ysuowheiiz`

Optional environment variable:

`PUBLIC_CLARITY_PROJECT_ID=ysuowheiiz`

The ID is public configuration, not a credential. The main site defaults analytics/ad storage to denied and updates Google Consent Mode plus Microsoft Clarity Consent API V2 from the first-party privacy-choice control. Advertising storage remains denied.

For `blog.stripunion.com`, use the official Microsoft Clarity WordPress plugin. The plugin is installed and active. In WordPress admin, open **Clarity**, sign in through Microsoft's OAuth UI, choose the existing **stripunion.com** project (project ID `ysuowheiiz`), and continue. Do not create a duplicate project for the Blog. Complianz and WP Consent API remain the Blog consent layer.

The public Blog health check records `BLOG_CLARITY` and `BLOG_CONSENT_SURFACE`. Set repository variable `BLOG_CLARITY_REQUIRED=true` only after the existing Clarity project has been linked and the public Blog HTML exposes the expected tag; from then on a missing/mismatched Clarity tag becomes a health-check failure.

For unattended behavior-data ingestion, in the same Clarity project open **Settings -> Data Export -> Generate new API token**. Create a token such as `StripUnion-Growth`, copy it once, and save it as the GitHub Actions repository secret `CLARITY_API_TOKEN`. Do not paste the token into chat or commit it. The daily SEO workflow will then export a 3-day URL-level behavior snapshot and feed measured friction signals into Growth Brain.

The Blog currently has **Site Kit by Google** active, but public-health checks do not observe a GA4 Measurement ID in the rendered Blog HTML. To finish the shared GA4/Clarity consent layer, open Site Kit -> Settings -> Connected Services -> Analytics, connect/select the existing StripUnion GA4 property and web stream (current unified-funnel candidate `G-K57BRX69X1`), and keep Complianz/WP Consent API as the Blog consent surface. Re-run the health workflow after saving.
