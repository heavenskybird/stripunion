import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { produceBlogDraft, publishReviewedBlog, reconcileReviewedBlog, proposeFromBlogGsc } from './blog-production-chain.mjs';
import { githubBlogJournal, existingWordpressPublisher, wordpressLiveVerifier, authorizeBlogOperator } from './blog-production-adapters.mjs';

const load = async file => JSON.parse(await fs.readFile(file, 'utf8'));
function option(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
function sourcePath(file) {
  const absolute = path.resolve(file || '');
  const root = path.resolve('.') + path.sep;
  if (!absolute.startsWith(root) || absolute.includes(path.sep + '.git' + path.sep) ||
      absolute.includes(path.sep + 'wordpress-queue' + path.sep) || !absolute.endsWith('.json')) throw new Error('BLOG_INPUT_PATH_REFUSED');
  return absolute;
}

export async function currentBlogInventory({ env = process.env, fetchImpl = fetch } = {}) {
  const rows = [];
  for (const name of (await fs.readdir('src/data/guides')).filter(n => /^[a-z0-9-]+\.js$/.test(n))) {
    const guide = (await import(pathToFileURL(path.resolve('src/data/guides', name)).href)).default;
    rows.push({ slug: guide.slug, title: guide.title, destination: 'astro' });
  }
  for (const name of (await fs.readdir('ops/editorial/content-artifacts')).filter(n => n.endsWith('.json'))) {
    const artifact = await load('ops/editorial/content-artifacts/' + name);
    rows.push({ slug: artifact.slug, title: artifact.title, intentKey: artifact.intentKey, destination: 'astro-artifact' });
  }
  if (!env.WP_USERNAME || !env.WP_APP_PASSWORD) throw new Error('BLOG_FRESH_PRIVATE_INVENTORY_CREDENTIALS_REQUIRED');
  for (let page = 1; page <= 50; page++) {
    const url = `https://blog.stripunion.com/wp-json/wp/v2/posts?context=edit&status=any&per_page=100&page=${page}&_fields=id,slug,title,status`;
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: {
      authorization: 'Basic ' + Buffer.from(env.WP_USERNAME + ':' + env.WP_APP_PASSWORD.replace(/\s+/g, '')).toString('base64') } });
    if (!response.ok) throw new Error('BLOG_INVENTORY_API_REFUSED_HTTP' + response.status);
    const pages = Number(response.headers.get('x-wp-totalpages'));
    if (!Number.isSafeInteger(pages) || pages < 1 || pages > 50) throw new Error('BLOG_INVENTORY_PAGINATION_NOT_PROVEN_COMPLETE');
    const posts = await response.json();
    if (!Array.isArray(posts)) throw new Error('BLOG_INVENTORY_INVALID');
    rows.push(...posts.map(post => ({ slug: post.slug, title: post.title?.raw || post.title?.rendered,
      destination: 'blog', status: post.status, postId: post.id })));
    if (page === pages) return { rows, complete: true, checkedAt: new Date().toISOString() };
  }
  throw new Error('BLOG_INVENTORY_INCOMPLETE');
}

async function main() {
  const command = process.argv[2];
  if (command === 'propose') {
    const snapshot = await load(sourcePath(option('--gsc')));
    const inventoryFile = option('--inventory');
    if (!inventoryFile) throw new Error('BLOG_READ_ONLY_INVENTORY_SNAPSHOT_REQUIRED');
    const inventory = await load(sourcePath(inventoryFile));
    if (inventory.complete !== true || !Array.isArray(inventory.rows) || Date.now() - Date.parse(inventory.checkedAt) > 3600000 ||
        !Number.isFinite(Date.parse(inventory.checkedAt)) || Date.parse(inventory.checkedAt) > Date.now()) throw new Error('BLOG_INVENTORY_NOT_FRESH');
    const proposals = proposeFromBlogGsc({ snapshot, inventory: inventory.rows });
    await fs.mkdir('artifacts/blog-recovery', { recursive: true });
    await fs.writeFile('artifacts/blog-recovery/proposals.json', JSON.stringify(proposals, null, 2) + '\n');
    console.log(JSON.stringify({ state: 'PROPOSAL_REVIEW_REQUIRED', candidates: proposals.proposals.length,
      held: proposals.proposals.filter(p => p.status === 'HOLD').length, rejectedRows: proposals.rejectedRows, published: false }));
  } else if (command === 'prepare') {
    // Imported provider output is a real draft artifact, never publication-ready queue data.
    // Deployments can inject their own provider.generateDraft through produceBlogDraft.
    const brief = await load(sourcePath(option('--brief')));
    const draft = await load(sourcePath(option('--draft')));
    const inventoryFile = option('--inventory');
    if (!inventoryFile) throw new Error('BLOG_READ_ONLY_INVENTORY_SNAPSHOT_REQUIRED');
    const snapshot = await load(sourcePath(inventoryFile));
    if (snapshot.complete !== true || !Array.isArray(snapshot.rows)) throw new Error('BLOG_INVENTORY_NOT_COMPLETE');
    const result = await produceBlogDraft({ brief, inventory: snapshot.rows, inventoryCheckedAt: snapshot.checkedAt,
      provider: { generateDraft: async () => draft } });
    const output = path.resolve('artifacts/blog-recovery');
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, result.artifact.payload.slug + '.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ state: 'DRAFT_REVIEW_REQUIRED', slug: result.artifact.payload.slug,
      artifactHash: result.artifactHash, published: false, outputDirectory: 'artifacts/blog-recovery' }));
  } else if (command === 'publish' || command === 'reconcile') {
    if (process.env.BLOG_PUBLISH_ENABLED !== 'true') {
      console.log(JSON.stringify({ state: 'PAUSED_BY_OPERATOR', published: false, externalRequests: 0 }));
      return;
    }
    const source = await load(sourcePath(option('--artifact')));
    const review = await load(sourcePath(option('--review')));
    authorizeBlogOperator(review);
    const common = { artifact: source.artifact, review, enabled: true, store: githubBlogJournal({ token: process.env.GH_TOKEN }),
      verifier: wordpressLiveVerifier(), authorizeReviewer: r => authorizeBlogOperator(r) };
    let result;
    if (command === 'reconcile') result = await reconcileReviewedBlog(common);
    else {
      const snapshot = await currentBlogInventory();
      result = await publishReviewedBlog({ ...common, inventory: snapshot.rows, inventoryCheckedAt: snapshot.checkedAt, publisher: existingWordpressPublisher() });
    }
    // Journal confirmation precedes the derived ledger mirror. A failed mirror
    // can be repaired from the same confirmed receipt without another provider call.
    if (result.published && result.receipt?.state === 'confirmed') {
      const receipt = result.receipt;
      const ledgerPath = `ops/editorial/publication-ledger/wordpress/${receipt.slug}.json`;
      let prior = null;
      try { prior = await load(ledgerPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (prior && (prior.post_id !== receipt.postId || prior.url !== receipt.url)) throw new Error('BLOG_LEDGER_CONFLICT_HOLD');
      if (prior && Date.parse(prior.recorded_at) > Date.parse(receipt.verifiedAt)) throw new Error('BLOG_LEDGER_TIMESTAMP_REGRESSION');
      const record = { recorded_at: prior?.recorded_at || receipt.verifiedAt,
        source_file: option('--artifact'), title: source.artifact.payload.title,
        slug: receipt.slug, post_id: receipt.postId, status: 'publish', url: receipt.url,
        categories: source.artifact.payload.categories || [], tags: source.artifact.payload.tags || [],
        action: prior?.action || 'created', review_hash: receipt.reviewHash, artifact_hash: receipt.artifactHash,
        publication_key: receipt.key, verified_at: receipt.verifiedAt,
        distribution: 'not_requested_operator_send_disabled', source: 'reviewed_blog_production_chain' };
      await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
      await fs.writeFile(ledgerPath, JSON.stringify(record, null, 2) + '\n');
    }
    // No provider sends or inferred distribution-success receipt.
    console.log(JSON.stringify({ state: result.state, published: result.published,
      receipt: result.receipt, journalSha: result.journalSha || null, providerCalls: result.providerCalls }));
  } else throw new Error('Usage: blog-production-cli.mjs propose --gsc file [--inventory file] | prepare --brief file --draft file [--inventory file] | publish --artifact file --review file');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
