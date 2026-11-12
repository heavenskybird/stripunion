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

Review-blocker correction: prepare/propose now require a fresh complete precomputed
inventory snapshot via --inventory and never receive WordPress secrets. Only the
publish path may read authenticated private inventory. Publication also requires
an authenticated first-attempt canonical-main workflow_dispatch actor present in
the separately configured BLOG_AUTHORIZED_REVIEWERS variable, matching the bound
reviewer; an empty allowlist fails closed. The core publisher requires an explicit
trusted authorization callback before journal access. Free-text JSON approval
alone cannot authorize publication. No allowlist or production variable was set.
117 combined tests cover these boundaries and credential-free preparation.

Sitemap propagation reconciliation: after a verified WordPress POST response,
persist postId/url/providerReceiptVerified with the original intent before any
public read verification. Verification performs at most3 read-only attempts
(configurable1–5, delay0–30s; each real request already has a timeout). It never
re-enters publisher.publish. If still unconfirmed, retain reconcile_required,
the intent key and post ID and raise a fixed alert.

Manual `reconcile --artifact FILE --review FILE` mode has no publisher dependency
and receives no WordPress credentials. It reads only the persisted proven post
receipt and public HTTP/canonical/indexability/sitemap, then CAS-confirms the same
entry. The existing ledger mirror runs only after confirmation. Missing/unproven
post IDs, changed artifact/review, failed reads or CAS loss remain held; no POST,
deletion or old draft replay. Trusted operator and default-off gates still apply.

Rollback first disables BLOG_PUBLISH_ENABLED, drains the Blog writer and preserves
all journal/unknown evidence. Revert only the reviewed chain callsite through a
scoped PR; do not delete posts, replay old payloads, or turn ambiguous writes into
success. No merge/deploy or runtime branch provisioning performed in this task.
