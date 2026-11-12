# Sprint E — independent Blog recovery, offline candidate

Base: `ab0f9258` on 2026-11-12. Issue: [#163](https://github.com/heavenskybird/stripunion/issues/163).
This change does not enable publishing or claim two real Blog acceptance cycles.

## Confirmed root cause

The canonical `wordpress-editorial-publish.yml` is a queue consumer. It triggers
on added/modified `ops/editorial/wordpress-queue/*.json` on main, or an explicit
manual input. It has no topic proposer, draft generator or scheduled queue writer.
Repository-wide references to this queue lead only to that consumer and publisher.
The queue contains exactly two historical payloads: one published article and one
acceptance draft. The WordPress ledger likewise has one published record and one
draft record, both from October 4. The 1,590 Astro modules at this audit base do
not count as Blog publications. A successful Blog health check cannot repair the
missing upstream producer.

Fresh authenticated, **GET-only** WordPress REST reads on November 12 confirm:

| Observation | Evidence |
| --- | --- |
| Newest published post | ID 460, `adult-shop-privacy-packaging-billing-delivery` |
| Published UTC | `2026-10-04T07:55:25` |
| Last modified UTC | `2026-10-04T08:00:56` |
| Next published post | ID 401, `live-cam-token-pricing-guide`, September 26 |
| Sample of latest date-ordered drafts | IDs 278, 276, 274; March 14 |

Queries: `/wp/v2/posts`, `status=publish` and `status=draft`, ordered by date
descending, `per_page=3`, metadata fields only. No content, credentials or user
data were logged; no POST/PUT/DELETE occurred. These bounded reads confirm the
latest public post at inspection; they do not establish readiness of every draft.
The official endpoint contract is documented at
[WordPress Posts REST reference](https://developer.wordpress.org/rest-api/reference/posts/).

## Safety gaps found in the current consumer

- The live script accepts four strings as its initial content checks and defaults
  omitted status to `publish`; a bound editorial/intent review is not required.
- Slug lookup updates an existing post, which is useful for controlled updates
  but does not distinguish a newly reviewed article from an old draft replay.
- Same-workflow concurrency does not establish a durable intent journal against
  other publishers, an uncertain POST outcome, or a lost ledger commit.
- Existing live verification checks canonical/indexability and probes sitemaps,
  but reports `not_confirmed` sitemap evidence without failing closed.
- Existing ledger describes a distribution hook; it is not a provider delivery
  receipt. Sending remains disabled during recovery.

These are confirmed source-code properties, not evidence that an unobserved live
attempt failed. The current production publisher and payloads remain unchanged.

## Implemented offline recovery workbench

`node scripts/blog-recovery-workbench.mjs` reads repository inventory and prints
a distinct Blog-versus-Astro audit. It cannot publish, access credentials, call a
model/provider or write the production queue/ledger.

Exported helpers provide:

- Candidate briefs from supplied Blog signals, with date/source checks, required
  audience/reader-job/intent fields and holds for occupied Blog or Astro intent.
- Draft-only structural review, minimum length/sections, unsafe-HTML rejection,
  primary-source metadata and explicit reviewer assertions. Returned hashes bind
  a review to the exact draft; changing content invalidates the review.
- A **pure mock** publisher transition: expected-revision CAS, stable content/slug
  identity, no-op replay of a confirmed identical item, quarantine of ambiguous
  outcomes, and required mock 200/canonical/indexable/sitemap evidence. Two mock
  cycles never produce production acceptance or enable social distribution.

Review assertions and vocabulary overlap are inputs/heuristics, not an automated
fact checker or proof of semantic originality. Source URL/time metadata does not
replace reading primary material. Minimum word count is a floor, not permission
to use filler. The mock revision journal is not a deployed durable lock.

## Validation and next gate

`node --test scripts/test/blog-recovery-workbench.test.mjs` passes four tests:
Blog/Main/stale/occupied signal holds; legacy/unreviewed/unsafe draft rejection;
two distinct simulated cycles with no transport; replay/CAS/hash/unknown-result,
canonical and sitemap safety. `globalThis.fetch` throws if called in simulation.
The repository audit reports two queue files, two ledgers, one published ledger,
and zero external requests.

Before unattended real Blog publication, a separate reviewed integration must
persist the proposal, exact content review and a durable pre-request intent;
verify current Blog/Astro inventory; serialize all publishers; reconcile unknown
results before retry; and enforce canonical, sitemap and consent-safe analytics.
Only then may explicitly authorized new reviewed payloads enter the live queue.
Do not replay old payloads/drafts to simulate cadence recovery. Acceptance still
requires two distinct **real**, verified Blog cycles; no such cycle occurred here.

Merge scope: standalone helpers/tests/docs only. No workflow, live publisher,
R1 Receipt, Scheduler, real queue, historical ledger or send switch changes.
Rollback of this candidate is removal of these standalone files through a PR;
there is no production state migration or cleanup to reverse.
