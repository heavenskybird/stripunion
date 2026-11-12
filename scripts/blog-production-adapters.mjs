import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

export function authorizeBlogOperator(review, env = process.env) {
  const actor = String(env.GITHUB_ACTOR || '').toLowerCase();
  const allowed = String(env.BLOG_AUTHORIZED_REVIEWERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'heavenskybird/stripunion' ||
      env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_RUN_ATTEMPT !== '1' || !actor || !allowed.includes(actor) ||
      String(review?.reviewer || '').toLowerCase() !== actor) throw new Error('BLOG_TRUSTED_OPERATOR_AUTHORIZATION_REQUIRED');
  return true;
}

// Explicitly provision this isolated branch/file before enabling real publishing.
// Never auto-create a branch, erase a corrupt journal, or fall back to main.
export function githubBlogJournal({ token, fetchImpl = fetch }) {
  const endpoint = 'https://api.github.com/repos/heavenskybird/stripunion/contents/ops/editorial/blog-publication-journal.json';
  const branch = 'codex/blog-publication-runtime';
  async function request(url, options = {}) {
    if (!token) throw new Error('BLOG_JOURNAL_CREDENTIAL_MISSING');
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' } });
    if (!response.ok) throw new Error('BLOG_JOURNAL_API_REFUSED_HTTP' + response.status);
    return response.json();
  }
  return {
    async read() {
      const file = await request(endpoint + '?ref=' + encodeURIComponent(branch));
      return { sha: file.sha, state: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) };
    },
    async write(state, sha) {
      const result = await request(endpoint, { method: 'PUT', body: JSON.stringify({ branch, sha,
        message: 'ops: record reviewed Blog publication transition', content: Buffer.from(JSON.stringify(state, null, 2) + '\n').toString('base64') }) });
      return result.content?.sha;
    }
  };
}

export function existingWordpressPublisher({ env = process.env } = {}) {
  return { async publish(payload, { authorizationHash }) {
    if (env.BLOG_PUBLISH_ENABLED !== 'true' || env.WP_SITE_URL !== 'https://blog.stripunion.com') throw new Error('BLOG_OPERATOR_GATE_OR_ORIGIN_REFUSED');
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'stripunion-reviewed-blog-'));
    const source = path.join(temporary, 'reviewed-payload.json');
    try {
      await fs.writeFile(source, JSON.stringify(payload), { mode: 0o600 });
      const { stdout } = await execute(process.execPath, ['scripts/publish-wordpress-json.mjs', source], {
        env: { ...env, BLOG_PUBLISH_ENABLED: 'true', BLOG_CREATE_ONLY: 'true', BLOG_REVIEW_HASH: authorizationHash }, timeout: 180000, maxBuffer: 100000 });
      return JSON.parse(stdout);
    } catch { throw new Error('BLOG_EXISTING_PUBLISHER_FAILED_RECONCILE'); }
    finally { await fs.rm(temporary, { recursive: true, force: true }); }
  } };
}

export function wordpressLiveVerifier({ fetchImpl = fetch } = {}) {
  return { async verify(url) {
    const expected = new URL(url);
    if (expected.origin !== 'https://blog.stripunion.com' || expected.search || expected.hash) throw new Error('BLOG_VERIFIER_ORIGIN_REFUSED');
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const html = await response.text();
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical/i)?.[1] || '';
    const blockedMeta = /<meta[^>]+(?:name=["']robots["'][^>]+content=["'][^"']*noindex|content=["'][^"']*noindex[^>]+name=["']robots)/i.test(html);
    const blockedHeader = /noindex/i.test(response.headers.get('x-robots-tag') || '');
    let sitemapContainsUrl = false;
    for (const pathname of ['/post-sitemap.xml', '/wp-sitemap-posts-post-1.xml']) {
      const sitemap = await fetchImpl(expected.origin + pathname, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (sitemap.status !== 200) continue;
      const xml = await sitemap.text();
      if ([...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].some(match => match[1].trim() === url)) { sitemapContainsUrl = true; break; }
    }
    return { status: response.status, url, canonical, indexable: !blockedMeta && !blockedHeader, sitemapContainsUrl };
  } };
}
