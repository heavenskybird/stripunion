# Recovery: explicit collection status and Buffer freshness

Incident #166 / run 42982170466 persisted valid GSC, GA4, Clarity, Bing,
StripCash and attribution snapshots, but a Buffer 429 made the final job red.
The weekly report continued showing a Buffer snapshot collected November 4
as November 11 distribution performance.

`data/collection-status.json` now records each source's step outcome,
collection timestamp, snapshot data date/range and whether this run produced
a snapshot. A successful exit with only an old snapshot does not pass.
Malformed/future timestamps fail freshness validation. Old snapshots remain.
The status is written before report/persistence, so Git history retains it.
The final summary refuses a status from a different run.

- `healthy`: all observed checks pass.
- `degraded`: only supplementary sources (Buffer or GA4 Admin) failed, or
  Clarity is not configured. A visible Actions warning and source table remain;
  this does not mean full business success. Optionality does not excuse missing
  credentials or suppress the recorded failure.
- `failed`: any required source, configured Clarity, Bing acceptance or public
  Blog health failed. The existing final failure gate remains active.

The Buffer report uses the existing 72-hour collection-freshness policy. An
older, missing or invalid snapshot yields `sources.buffer=false`, explicit
freshness metadata, null performance/count fields and UNAVAILABLE Markdown.
Historical raw data is preserved. Fresh snapshots retain their snapshot date;
Buffer's 90-day sent-post window is not a daily delivery count.

This change does not solve Buffer's 30-day quota, restore social delivery,
change credentials, or authorize replay. It does not change other source
aggregation or claim the GA4/affiliate measurement gaps are repaired.

Validation: 15 offline data tests passed, including partial failure, healthy
sources retained, old/future/corrupt snapshots rejected as current. A report
fixture using the actual tracked latest source snapshots verified stale Buffer
metrics/counts are null and Markdown is explicit. Quality check passed.
No collector API calls, production writes or workflow reruns were used.

After reviewed merge, inspect the next normal daily run: status runId must
match, GSC/GA4/etc. timestamps must be after collection start, Buffer failure
must remain visible as degraded, and successful snapshots must persist.
An injected critical failure in offline tests must still produce failed.
Rollback via a new codex PR reverting only these code/workflow changes;
retain all raw snapshots and recorded status history.
