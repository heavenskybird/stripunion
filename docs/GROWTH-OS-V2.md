# StripUnion Autonomous Growth OS v2

## Operating objective

Turn the existing publishing automation into an auditable closed loop:

```
official/first-party data
  -> opportunities
  -> Growth Brain decisions
  -> governor
  -> producer / update / experiment queues
  -> quality + visual gates
  -> publication + distribution
  -> first-party attribution
  -> normalized observations
  -> experiment evaluation
  -> next Growth Brain cycle
```

The system optimizes for durable traffic, affiliate conversion and attributable revenue. Publication volume is an objective, never permission to produce filler or duplicate content.

## Layers

### Data layer

Core inputs are first-party, official or open sources:

- Google Search Console
- GA4
- Bing Webmaster
- Microsoft Clarity
- StripCash aggregate statistics
- StripUnion first-party AVCams click/postback attribution
- public site and competitor metadata
- centralized direct-offer registry

Paid SEO suites are optional enrichment, not critical dependencies.

### Growth Brain v2

`ops/growth/brain.mjs` turns evidence into ranked, machine-readable decisions:

- `CREATE`
- `UPDATE`
- `MIGRATE`
- `EXPERIMENT`
- `BUILD_AUTHORITY`
- `HOLD`

Every decision carries priority, eligibility, risk, confidence, evidence and rationale. The editorial producer consumes these decisions before raw search signals.

### Growth Governor

The Brain emits explicit operating guardrails:

- five publications/hour remains the current content-build target and hard maximum
- quality gates may reduce actual output
- filler content is forbidden
- high-risk actions are never auto-implemented
- duplicate/cannibalization gates remain authoritative
- at most one conversion experiment may run concurrently

### Experiment engine

`ops/growth/experiments.mjs` maintains a durable experiment state machine.

CTA experiments are proposed from low-CTR GA4 surfaces. An experiment may auto-start only when the evidence threshold is met. It runs for a bounded 7-14 day window and requires per-variant telemetry before selecting a winner.

A winner requires both:

- a two-proportion z-score magnitude of at least 1.96
- at least 10% relative CTR lift

Otherwise the engine continues collecting or closes the test as inconclusive.

### Revenue and behavioral observations

`ops/growth/observations.mjs` normalizes decision inputs and outcome signals into Control Plane rows. It includes:

- page sessions / affiliate clicks / CTR
- Clarity friction severity
- Bing authority/backlink signals
- first-party clicks and postbacks
- matched/unmatched postbacks
- attributed revenue by currency
- per-page-key attribution
- experiment telemetry when available

Aggregate affiliate revenue is never assigned to a keyword without a valid join.

### Control Plane

Supabase/Postgres stores operational mirrors and learning state:

- opportunities
- jobs
- publications
- offers
- observations
- experiments
- visual checks
- dead letters
- run audit records

During shadow mode Git remains authoritative. The database-authority cutover is a release gate, not a development blocker.

## Authority modes

### shadow

Current production mode.

Repository state drives publication. Supabase receives state, observations and learning records. A database problem does not stop publishing.

### authoritative

Implemented target mode after shadow acceptance. Selected batches are claimed in Postgres with a bounded lease, reconciliation projects database state back into the repository backlog, failed runs create dead-letter audit records, and final publication state is checkpointed back to Postgres. Git continues to store code, immutable content artifacts, configuration and durable reports.

Authority is promoted automatically only after the shadow acceptance checks pass. The scheduled promotion workflow validates 24 distinct hourly cycles, time continuity and repository-to-database coverage before changing the tracked mode file.

## Closed-loop completion criteria

The architecture is considered implemented when:

1. Growth Brain decisions are produced automatically and consumed by the producer.
2. observations and experiments are persisted to the Control Plane.
3. responsive visual results are persisted to the Control Plane.
4. workflow failures create dead-letter records.
5. first-party experiment exposure/click/conversion telemetry is available.
6. experiment winners feed future decisions without manual spreadsheet work.
7. database authority can be enabled after the shadow gate without a redesign.

All seven implementation items are now represented in code. Item 7's **activation** remains intentionally gated by observed production evidence; the gate itself is automated and performs the promotion without a manual reminder.
