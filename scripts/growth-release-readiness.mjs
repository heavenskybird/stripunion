// This workflow has no publication, send, dispatch or configuration-write client.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './recovery-readonly-evidence.mjs';
import { journal } from './social-outbox-safety.mjs';
import { REGISTRY_ID, registryEntries } from './telegram-autonomy-policy.mjs';
import { githubBlogJournal, wordpressLiveVerifier } from './blog-production-adapters.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const report = JSON.parse(await fs.readFile('work/recovery/readonly-evidence.json'));
report.channelFlags = Object.fromEntries(['SOCIAL_OUTBOX_SEND_ENABLED','SOCIAL_OUTBOX_X_SEND_ENABLED','SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED','SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED','BLOG_PUBLISH_ENABLED'].map(k => [k, process.env[k] || 'UNSET']));
report.trialSelectorEmpty = !process.env.SOCIAL_OUTBOX_TRIAL_EVENT_KEY;
report.blogAuthorizedReviewerConfigured = !!process.env.BLOG_AUTHORIZED_REVIEWERS;
try {
  const registry = await journal({ idempotency_key: REGISTRY_ID });
  const entries = registryEntries(registry);
  report.telegramRegistry = { readable: true, entries: entries.length, digest: hash(JSON.stringify(entries)) };
} catch { report.telegramRegistry = { readable: false }; }
try {
  const journal = await githubBlogJournal({ token: process.env.GH_TOKEN }).read();
  report.blogJournal = { readable: journal.state.version === 1 && Array.isArray(journal.state.entries), sha: journal.sha, entries: journal.state.entries.length };
} catch { report.blogJournal = { readable: false }; }
report.blogReviewSources = [];
for (const slug of ['live-cam-site-safety','are-live-cam-sites-free']) {
  const root = 'docs/audits/2026-11-13/blog-review-drafts/' + slug;
  const review = JSON.parse(await fs.readFile(root + '.review.json'));
  const draft = await fs.readFile(root + '.html', 'utf8');
  const result = { postId: review.postId, slug, draftHashMatches: hash(draft) === review.draftSha256, approved: false };
  try {
    if (!process.env.WP_USERNAME || !process.env.WP_APP_PASSWORD) throw Error('missing');
    const response = await fetch('https://blog.stripunion.com/wp-json/wp/v2/posts/' + review.postId + '?context=edit', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { authorization: 'Basic ' + Buffer.from(process.env.WP_USERNAME + ':' + process.env.WP_APP_PASSWORD).toString('base64') }
    });
    if (response.status !== 200) throw Error('read');
    const post = await response.json();
    result.sourceBindingMatches = post.id === review.postId && post.slug === slug && post.status === review.expectedStatus &&
      post.modified_gmt === review.expectedModifiedGmt && typeof post.content?.raw === 'string' && hash(post.content.raw) === review.expectedSourceSha256;
    result.modifiedGmt = post.modified_gmt;
    result.live = await wordpressLiveVerifier().verify(post.link);
  } catch { result.sourceBindingMatches = null; result.error = 'BLOG_READ_NOT_VERIFIED'; }
  report.blogReviewSources.push(result);
}
// Zero-job exemptions apply only to the inspected historic queued records.
const active = report.mainActiveRuns.filter(run => !report.queueReview.some(q => q.id === run.id && q.status === 'queued' && q.jobsHttp === 200 && q.jobCount === 0));
report.release = { noMainActiveRuns: report.activeInventoryComplete && active.length === 0, active,
  producerReceiptSuccess: report.receipt.status === 'success', rollbackBuild: report.hostinger?.latestBuild || null,
  telegramDelivered: false, blogPublished: false, note: 'Readiness is not a delivery receipt or Blog approval. Refresh active runs immediately before merge.' };
await fs.writeFile('work/recovery/growth-release-readiness.json', JSON.stringify(report, null, 2) + '\n');
console.log('GROWTH_RELEASE_READINESS ' + JSON.stringify({ checkedAt: report.checkedAt, channelFlags: report.channelFlags, trialSelectorEmpty: report.trialSelectorEmpty,
  telegramRegistry: report.telegramRegistry, blogJournal: report.blogJournal, blogReviewSources: report.blogReviewSources, release: report.release }));
if (!report.telegramRegistry.readable || !report.blogJournal.readable || report.blogReviewSources.some(r => !r.draftHashMatches || r.sourceBindingMatches !== true)) process.exitCode = 1;
