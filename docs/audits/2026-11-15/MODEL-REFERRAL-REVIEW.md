# Model-referral route and opt-in campaign review

Scope: Issue #199, isolated `codex/model-referral-20261115`, based on canonical main 98f56610. No outreach, signup, fake conversion, Worker deployment, switch, DNS/CDN or WordPress write. This package is review-only until the code is merged and production accepted; it does not claim partner credit or revenue.

## Correct existing funnel

Existing `/become-a-cam-model` and `/avcams` already have model CTAs; a new funnel is unnecessary. The existing copy called this AVCams creator registration and the model page used the general `su_crosssell` campaign, obscuring the provider role and model-versus-viewer program.

The change names official **Stripchat** onboarding reached through AVCams, keeps the central approved tracking account/destination, attaches `su_model_referral` to `/signup/model` (including the existing AVCams model button), retains page/placement SubIDs, and exposes `affiliate_mode=model-referral` to the existing consent-safe event handler. Ordinary viewer campaigns remain unchanged. Three compact local Paid referral disclosures make clear that StripUnion may earn a referral fee, not that an applicant receives a promised payment. A contextual internal entry appears only on the creator/fan category, not unrelated viewer, game or privacy guides.

`model-referral-readonly.yml` builds production-indexable HTML, runs focused tests and SEO checks, verifies responsive creator/AVCams/category pages, and observes the live page plus direct white-label and existing live tracked model route with bounded GET-only redirects. It never requests the first-party click receiver, creates memberId/p3, submits a form, joins a community or sends an event/message. An upstream tracking GET may register a diagnostic provider click, so it must not be counted as genuine new creator acquisition. Sanitized results preserve status, host/path, parameter keys and equality checks, never raw identity tokens or cookie values. Public route proof is not commission proof.

## Official terms checked 2026-11-15

Primary source, article updated 2026-09-10:
https://help.stripcash.com/hc/en-us/articles/30212048997532-Can-I-recruit-models-studios-or-new-affiliates-through-my-white-label

The official article was successfully read in this session. It says white labels have no dedicated model onboarding; registration redirects to the main site. It documents `/signup/model`, a tracked white-label redirect, and `stripchat.com/become-a-model` examples. It describes three one-time referral amounts **$75/$50/$25 after the model reaches $200 revenue**. These are referral-program terms, not creator salary, earnings promises or rewards offered by StripUnion. No referral commission applies to studio acquisition or models recruited by studios. Affiliate referral is a separate **5% of invited partners' revenue**, not the viewer revenue-share scheme.

**Unverified:** The public help article does not enumerate country→tier mappings, country eligibility, current account-specific enrollment, attribution window, payout availability or identity-review outcome. A public read of the account Referral Models URL exposes an application shell, not authenticated terms. No worldwide eligibility or tier assignment is claimed. The owner should inspect the existing StripCash Referral Models account page once for applicable countries/current terms and share only sanitized conditions, never credentials or model identity documents.

The official black-hat-policy URL was blocked by a provider challenge during this read; no circumvention or protection change was attempted. Earlier Issue #199 policy evidence remains provenance, not a newly successful fetch.

## Ready-to-review copy; none sent or published

### 1. Short opt-in professional-community post

> Considering live broadcasting as an independent adult creator? Our free 18+ guide explains the AVCams referral route to official Stripchat registration, age/identity checks, privacy choices and questions to resolve before applying. Platform eligibility varies; earnings are not guaranteed. StripUnion is an independent information/referral site and may receive a qualifying referral commission. Read the guide: https://stripunion.com/become-a-cam-model

Use only in a moderator-approved adult professional resource thread or an explicitly opted-in audience. This is information, not a salary offer. Do not turn it into unsolicited replies or DMs.

### 2. Informational article candidate

**Title: Before applying to become a live cam model: registration, privacy and independent work**

If you are an adult considering live broadcasting, start with the decisions you can verify rather than an income claim. A platform can provide a way to publish or broadcast, but it does not make an earnings outcome predictable. The amount earned, if any, can vary with the audience, schedule, paid features, pricing and applicable platform rules. StripUnion is not offering employment, assigning shifts, collecting your identity documents or managing creator payouts.

The AVCams model referral route is different from its viewer browsing pages. AVCams is a white-label discovery destination. Official StripCash documentation explains that model registration is handled on the main Stripchat site. Before entering personal information, inspect the final hostname and use the official platform flow. Do not send identity documents to a community contact, an unsolicited account, or StripUnion.

Review the current age and identity requirements. This resource is for adults 18+ only; it is not a way to bypass verification. Country availability, account approval, payout methods and creator terms may differ. Read the conditions shown to you for your location and seek platform support when a requirement is unclear. A page being accessible does not prove that your application or payment method is eligible.

Keep privacy separate from registration convenience. Think about the information visible in a profile, what could appear in the background, how you will separate public contact from private contact, and the account-recovery controls available. Set boundaries about what you are willing to publish or discuss. Avoid promises that a familiar brand, camera setting or account name can guarantee anonymity.

Read commercial terms before making a decision. Check payout conditions, permitted activity, account controls and what happens if you later stop using the service. Distinguish the platform's creator earnings rules from StripUnion's referral relationship. A qualifying referral may pay StripUnion a commission; that is not a payment promised to you. Studio-acquisition commissions are not being offered here.

If the fit remains appropriate after that review, our existing guide provides a model-specific referral route to the official registration flow. It is separate from viewer access. You can review the current application without committing to broadcast, and you should stop if you are uncomfortable with any requirement. No signup, approval, earnings or referral-credit outcome is guaranteed.

**Disclosure and destination:** Paid referral; independent 18+ information. https://stripunion.com/become-a-cam-model

Status: exact content requires Blog-specific review/authorization before any WordPress publication. No WordPress payload or auto-send entry is created by this package.

### 3. Creator FAQ copy

- **Who registers and verifies me?** The official platform, not StripUnion or the AVCams white label. Inspect the final Stripchat hostname and follow current platform instructions.
- **Is this a job, salary, or guaranteed reward?** No. This is an independent information/referral resource. Earnings and eligibility vary.
- **Do you need my ID or private contact details?** No. StripUnion does not collect creator verification documents. Provide them only in the verified official platform flow when required.
- **Can every country join?** No universal claim is made. Check current account, country, payout and verification terms.
- **Why does the guide disclose a referral?** StripUnion may receive a qualifying referral commission. This is not promised creator pay. Model, viewer and affiliate programs are separate.
- **Can a studio earn a recruitment bounty here?** No studio-acquisition commission is promoted.

## Community and distribution candidates

| Candidate | Actual rule/source evidence | Current decision |
| --- | --- | --- |
| AmberCutie Forum (ACF) professional model community | https://www.ambercutie.com/forums/help/terms/ read successfully: service is 18+; spam/spam-like content prohibited; staff may remove content. https://www.ambercutie.com/forums/ lists model verification and Ask-a-Model sections. | **HOLD — moderator permission required.** General terms do not grant affiliate recruitment permission. No commercial thread or DM is authorized by this research. Request an explicit adult resource-placement permission through the published contact route only after owner approval. |
| r/CamGirlProblems | https://www.reddit.com/r/CamGirlProblems/about/rules/ and wiki returned 403 through this reader. | **RESEARCH_PENDING / NOT APPROVED.** Do not infer posting rights or bypass the access restriction. Read current moderator rules through an ordinary authorized view before proposing a placement. |
| Existing @StripUnion opt-in channel | Repository Telegram policy and current authorization define a broadcast audience and cadence. | **HOLD FOR ROUTE + EDITORIAL REVIEW.** No model announcement is enqueued/sent here. A prepared post must still satisfy exact current channel policy, demand, content identity/CAS and cadence. |

No external community is newly approved for posting by this batch. A real published placement needs explicit rules/permission evidence, the correct 18+ context and a reviewed source-specific message. Candidate discovery is not an outreach result.

## 7/28-day measurement and gates

1. Production acceptance: actual creator/AVCams/category HTTP200, correct official-onboarding copy, four model CTAs in compiled creator+AVCams pages, compact referral disclosure, sponsored relation, unchanged account/path, new `su_model_referral`, existing page and placement IDs. The dedicated audit distinguishes compiled candidate from live deployment.
2. Compare 7/28-day `affiliate_click` cohorts with model mode/campaign/page/placement using existing consent-respecting telemetry. Compare like-for-like dates/host/source; viewer clicks must not be counted as model referrals. Do not store private model identities.
3. Partner-side funnel: actual eligible referred model registration → provider-confirmed $200 earned milestone → confirmed one-time USD referral. Account-specific provider confirmation is required; GET/HTTP200, registrations alone and CI do not prove payment. Unknown events remain unknown.
4. External promotion remains blocked until route/terms and community-specific approval are verified. No artificial signups, scraped contacts, bulk unsolicited DMs or automatic sends.
5. Rollback is the focused page/helper/component revert; retain prior telemetry and history. No credential, social switch or R1 receipt rollback is needed.
