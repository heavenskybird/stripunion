# Separate Sprint B runtime candidate

Base: main `74c772e3`. Original offline PR #178/head `56d8fd29` is unchanged.
This candidate is not deployed and makes no Worker, commercial-config, historical
record or R1 changes. Review #178 explicitly requested this separate consent fix.

## Actual browser behavior

`BaseLayout.astro` now re-reads the existing `su_consent_v2` preference on every
affiliate click. Only a readable `analytics_storage=granted` on stripunion.com
or www.stripunion.com permits optional first-party click fetch and affiliate-click
GA events. Denied, malformed/unreadable storage, revocation and staging fail
closed for that telemetry. The browser still follows the configured affiliate
link; commercial destinations, existing campaign/source fields and provider
`memberId` are preserved. No cookie banner default or advertising choice changed.

The explicit purpose is measuring the originating page/acquisition for partner
activity, using the site's analytics preference as this product's gate. This does
not assert that analytics consent is the legal basis for all operational metrics
or a partner's own data processing. Privacy copy explains that distinction.
Optional `su_acquisition` session storage is no longer written before grant and
is cleared when the site's consent control revokes it.

## Browser regression (no external calls)

```sh
PUBLIC_ALLOW_INDEXING=true npm run build
node scripts/test-affiliate-consent-browser.mjs
```

The Playwright test loads actual built production HTML through local route
fulfillment, intercepts **every request**, blocks service workers and prevents
partner navigation. Google, Clarity, Worker and destination URLs never reach the
network. It executes the real banner and click handlers, rather than a mock of
the intended guard. Scenarios cover denied → granted → revoked, unreadable
storage and staging. They assert exact first-party/GA affiliate event counts,
no pre-grant acquisition storage and preservation of existing commercial fields
including the documented staging QA overrides. The granted mock payload's
memberId must equal the outbound link's memberId. No fake conversion/postback
exists. `artifacts/affiliate-consent/report.json` contains counts only, not URLs,
member IDs, headers or payloads. CI builds the production artifact and runs the
same test with no production credentials.

## Provider contract evidence and limits

Read-only repository evidence:

- `src/lib/affiliate.js`: canonical configured AVCams destination, campaign,
  creative, source and p1/p2 dimensions. Browser adds memberId and p3; no partner
  destination/commission configuration changed.
- `docs/STRIPCASH_POSTBACK_ATTRIBUTION.md`: first-party account-configuration
  record from October 3 documents exact `{memberId}`, `{revenue}` and
  `{transactionId}` macros. This historical record is not a fresh inspection of
  the current provider account screen.
- `services/live-models-worker/src/index.js`: accepted aliases are memberId,
  member_id and memberid. Generic clickId/SubID are not interchangeable aliases.
  Retention is 30 days; the receiver uses arrival time and retains UNKNOWN
  currency when absent. No speculative provider mapping is introduced.

The 12 historical unmatched events remain unchanged and unexplained without
redacted event-level evidence. They must not be retroactively relabeled as
consent-denied, expired or successfully joined. This fix can intentionally reduce
the number of first-party clicks and increase unmatched postbacks; lower counts
are not permission to weaken consent or manufacture data.

## Future actual-production GA4 acceptance (not executed)

1. Approve a small live measurement window separately from merge approval. Read
   the existing GA4 property's timezone, stream, DebugView access and active test
   traffic filters. Do not assume debug events are automatically excluded from
   business reports. Record the exact UTC and property-local window.
2. Use a fresh adult tester browser on the real canonical site. With no saved
   preference, observe default analytics/advertising denied and no optional
   first-party click or affiliate-click GA event. Do not interpret Google's
   pre-existing Consent Mode cookieless pings as permission to store an optional
   first-party click. Preserve the site's other consent defaults.
3. Explicitly grant analytics through the existing banner. For a bounded GA4
   event test, block partner navigation and intercept the Worker click request
   locally so no attribution business counter is incremented. Observe actual
   page_view/session_start/affiliate_click in the correct stream/hostname using
   an approved GA4 test/debug session. This proves GA4 event receipt only, not a
   real first-party attribution join. Record names/time/status, not raw IDs or HAR.
4. Reopen Privacy choices and reject; confirm a subsequent test interaction
   emits no new optional click/affiliate GA event and clears acquisition storage.
5. Validate first-party attribution separately using a local mocked provider
   callback. For real-provider evidence, prefer an existing genuinely consented
   click and legitimate later callback with redacted matching-ID verification.
   If an intentional real click is authorized, disclose that it increments
   business counters; do not fabricate a purchase or callback to make it match.
6. Compare a truly post-deployment GA4 reporting window after settling, with the
   correct property timezone and hostname. GA4 date-filtered totals and cumulative
   AVCams summary totals are different scopes; neither must be forced to match.

No production acceptance, live click, live analytics event, provider-account
setting, postback, deployment or historical repair was performed here.

## Rollback

If the candidate is later deployed, pause optional measurement through the
existing analytics choice while investigating; keep affiliate navigation and R1
independent. A reviewed targeted revert must preserve denied defaults and must
not silently restore pre-grant first-party measurement. Do not clear or rewrite
historical Worker data, change commercial parameters, or alter Scheduler/Receipt.
