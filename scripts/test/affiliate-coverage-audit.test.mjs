import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../affiliate-coverage-audit.mjs');

async function run(html) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'su-audit-'));
  try {
    await fs.mkdir(path.join(root, 'src/data/guides'), { recursive: true });
    await fs.mkdir(path.join(root, 'src/components'), { recursive: true });
    await fs.mkdir(path.join(root, 'dist/guides/test-page'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/data/guides/test-page.js'), 'export default {"slug":"test-page","categorySlug":"adult-games"};');
    await fs.writeFile(path.join(root, 'src/components/GuideTemplate.astro'), '<article class="guide-body"></article>');
    await fs.writeFile(path.join(root, 'dist/guides/test-page/index.html'), html);
    const r = spawnSync(process.execPath, [script, '--root=' + root], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('footer or generic sitewide links are not contextual affiliate links', async () => {
  const r = await run('<article class="guide-body"><a href="/guides">More</a></article><footer><a data-affiliate-partner="avcams">go</a></footer>');
  assert.equal(r.contextualAffiliatePresent, 0);
  assert.equal(r.byCategory[0].category, 'adult-games');
});

test('a tracked paid link inside guide article is detected', async () => {
  const r = await run('<article class="article-body guide-body"><a data-affiliate-partner="avcams" href="https://go.whitetrafsa.com/">Go</a></article>');
  assert.equal(r.contextualAffiliatePresent, 1);
  assert.equal(r.missingOrUnknown, 0);
});

test('ordinary unapproved vendor link never falsely counts as monetized', async () => {
  const r = await run('<article class="guide-body"><a href="https://example.org/store">Visit</a></article>');
  assert.equal(r.contextualAffiliatePresent, 0);
});

test('absence of explicit article scope is unknown rather than paid', async () => {
  const r = await run('<main><a data-affiliate-partner="avcams">Go</a></main>');
  assert.equal(r.contextualAffiliatePresent, 0);
  assert.equal(r.missingOrUnknown, 1);
});
