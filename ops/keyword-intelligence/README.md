# Keyword Intelligence V0

Offline, additive foundation; Node.js 22, no dependencies, no production integration.

Read [implementation notes](../../docs/v2/KEYWORD-INTELLIGENCE-V0.md), [PRD](../../docs/v2/KEYWORD-INTELLIGENCE-PRD.md), [bootstrap evidence](../../docs/v2/PROJECT-BOOTSTRAP-REPORT.md) and [validation](../../docs/v2/VALIDATION.md).

Run `node --test ops/keyword-intelligence/test/*.test.mjs`. The inline sanitized fixtures are synthetic tests, while example-report.json is a labeled five-record excerpt from existing historical snapshots. Neither is a live ranking report. Missing values remain null; no monthly volumes are inferred from impressions.
