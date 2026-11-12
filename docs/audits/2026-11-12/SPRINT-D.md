# Sprint D — offline novelty and cost recovery

Baseline: `ab0f9258` canonical main. This PR introduces offline tools only: no
generator, admission, scheduler, deployed site, receipt, existing content or
workflow changes. No model calls, new credentials or paid service are needed.

## Explainable full-corpus audit

Run `node scripts/content-novelty-audit.mjs docs/audits/2026-11-12/content-novelty-report.json`.
The committed report covers all 1,590 canonical guide modules and considers
1,263,255 pairs. Pairs with fewer than two shared task concepts cannot meet the
review rule and skip the expensive lexical comparison. 3,571 pairs require
human review; the report contains the strongest 500, each flagged guide's highest
risk counterpart, and the original incident even if outside the top 500. Its
`truncated` flag and counts make this output bound explicit. This is a corpus
snapshot, not a new HTTP acceptance of every page or a Google duplicate-content
classification. Counts are warnings, not established duplicate articles.

The original games/shop age-check pair is caught despite different categories:
score .8151; body cosine .6985; task-intent overlap 1.0; takeaway concept overlap
.8333; section-task alignment .77. Shared tasks are age evidence, data recipient,
retention/account linkage, origin verification, disclosure decision and payment.
Category substitutions alone do not explain a distinct reader decision. Review
the actual download/demo task against retail account/checkout/shipping tasks and
require substantive task-specific value before treating two new drafts as
distinct. Do not automatically edit, delete or republish the existing pieces.

The rule combines four signals, rather than slug/ID or keyword matching alone:
35% lexical cosine, 25% intent concepts in title/description/takeaways, 20% core
takeaway concepts, 20% best section-task alignment. At least two shared concepts,
cosine >= .42 and combined score >= .65 trigger review. Audience/category is
reported for human assessment and never an automatic exemption. Generic safety
language can cause false positives; unfamiliar paraphrases and concepts can be
missed. The fixture for same-audience, same-template but different recovery vs
billing tasks remains below the review rule. `PASS_HEURISTIC` is not proof of
originality, and the gate never grants publication authority.

## Accounting and proposed pre-spend budgets

`scripts/editorial-cost-budget.mjs` is a pure, offline helper. Recorded request
identity is `(runId, attempt)`; duplicate identities throw rather than silently
double counting. Missing token evidence stays UNKNOWN. Retries count even when a
prior output was rejected. Reports distinguish an estimate from an invoice and
never derive available credit from a successful request.

Verified usage from existing production evidence:

| Run | Requests | Input | Output | Total | Generation retries |
| --- | ---: | ---: | ---: | ---: | ---: |
| 43151510253 | 2 | 60,740 | 22,733 | 83,473 | 1 |
| 43172741943 | 1 | 29,933 | 12,785 | 42,718 | 0 |

Sources are the `EDITORIAL_PROVIDER_USAGE` lines in the respective GitHub Actions
logs and publication-verification artifacts. These are recorded tokens, not
reconstructed charges. Later runs must be appended from their own evidence;
this table is not a complete daily bill.

The selected model is `gpt-6-luna`. Its price remains **UNKNOWN** in
`ops/editorial/model-pricing.json`. Official documentation MCP was not available
in the enabled tool catalog; no model-specific official rate was independently
verified. `https://openai.com/api/pricing/` is a candidate source, not proof of a
rate. Do not substitute prices of a similarly named model. A reviewer must enter
the exact model, actual official source, verification and expiry times and
numeric rates before setting `verified=true`. Tests use an explicitly fictitious
`fixture` model and rates, not production evidence.

The proposed guard fails closed for unknown/stale prices, missing token budgets,
missing dollar/credit evidence, batch request/output caps and daily request/token
or dollar overflow. A successful pure result is **not** a reservation or a
lease. Future integration must atomically CAS-reserve worst-case requests,
input/output tokens and dollars across all writers before each request; commit
observed usage after response; retain uncertain reservations after timeouts;
reject corrupt/missing daily state rather than resetting it; use UTC day windows
and preserve retry costs. Accurate input caps need a validated tokenizer or a
documented conservative bound. No character-count-to-token promise is made.

Current runtime still has its existing 3 requests × 20,000 output-token ceiling.
Neither this offline helper nor unknown prices change current Producer behavior.
Do not wire the guard into the generator until three-cycle acceptance and a
separately reviewed rollout establish price, balance/limit evidence, durable
reservation ownership and rollback. Rollback of these offline tools is to stop
using their CLI; no receipt/content/financial history rollback is required.

## Verification and merge boundary

`node --test scripts/test/content-novelty-cost.test.mjs` exercises the real
incident, a distinct-intent false positive, exact recorded retry accounting,
missing usage, duplicate identity, unknown/stale price, unknown credit and both
batch/daily limits. Existing full recovery tests are also run before delivery.
The PR can be reviewed independently; it has no production hooks. Production
novelty enforcement and budget activation remain explicitly deferred until R1
acceptance, with published history preserved.
