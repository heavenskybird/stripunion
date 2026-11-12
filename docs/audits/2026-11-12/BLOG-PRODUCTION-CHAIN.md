# Review-bound Blog production chain — default off

Depends on PR177's offline workbench, with main74c772e3 merged. Unlike that
workbench, this branch contains executable proposal/draft-artifact preparation,
an injected provider contract, a review-bound production adapter and a real
GitHub Contents CAS journal restricted to codex/blog-publication-runtime.
The existing WordPress publisher is called only after durable intent and exact
review. BLOG_PUBLISH_ENABLED defaults false; no repository variable was changed.

Manual workflow prepare mode writes separate review artifacts, not live queue
payloads. Publish mode additionally requires canonical main, first run attempt,
operator true, fresh exact artifact/review/source/intent/inventory evidence and
accepted durable state. The existing publisher now refuses missing review hash
and create-only mode refuses any existing slug: old drafts cannot be replayed.
Successful closure requires actual200, exact canonical, indexability and sitemap
membership. Ambiguous provider or persistence outcomes remain quarantined.

Validation:93 script tests passed, including9 chain/transport-mock tests for two
distinct cycles, paused zero-call operation, stale review, CAS conflict,
unknown/no replay and failed canonical/sitemap closure. No real draft generation,
WordPress publication, queue payload, historical Ledger, secret or toggle changed.

This is a separate Draft production candidate, not part of offline integration
PR183. Before enabling: independent review, purpose-bound source/quality review,
manual prepare artifact acceptance, reviewed isolated journal provisioning,
single-writer drain and explicit operator decision. Then two real Blog cycles
with live REST/HTTP/canonical/sitemap/Ledger evidence are needed. Astro output
does not count as Blog recovery. Keep social sends false.

Rollback first disables BLOG_PUBLISH_ENABLED, drains the Blog writer and preserves
all journal/unknown evidence. Revert only the reviewed chain callsite through a
scoped PR; do not delete posts, replay old payloads, or turn ambiguous writes into
success. No merge/deploy or runtime branch provisioning performed in this task.
