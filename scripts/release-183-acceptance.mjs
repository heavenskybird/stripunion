import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './recovery-readonly-evidence.mjs';
import { probeUrl, probeDeployment } from './check-live-publications.mjs';

const report = JSON.parse(await fs.readFile('work/recovery/readonly-evidence.json', 'utf8'));
const ghBase = 'https://api.github.com/repos/heavenskybird/stripunion/';
async function github(endpoint) {
  const r = await fetch(ghBase + endpoint, { headers: { authorization: `Bearer ${process.env.GH_TOKEN}` }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`RELEASE_READ_HTTP${r.status}`);
  return r.json();
}
const head = await github('commits/main');
report.mainSha = head.sha;
let checkpoint = null;
try { checkpoint = JSON.parse(await fs.readFile('../audit/docs/audits/2026-11-12/release-183-checkpoint.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
report.frozenSwitches = Object.fromEntries(['SOCIAL_OUTBOX_SEND_ENABLED', 'SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED',
  'SOCIAL_OUTBOX_X_SEND_ENABLED', 'SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED', 'BLOG_PUBLISH_ENABLED'].map(k => [k, process.env[k] || 'UNSET']));
const closures = ['c4bb08d16bf8722d112c4cf7862c691e97506480','a05a7bef3b2ae27ac3181bfe9f0254cbe2261345',
  'ab0f925823cc82dfbd5a653de3c5172945c074ad','74c772e3d2ec70c808b7e7af322426f95edffaf5','386faf7a7cb18e6fa1471ecef1dcce7aefce2a28','7a201921306e8e1d2f0538a2e6c43eac83f00337','8188a2e491eeb1c235fdf247173d416b3adfa7f6'];
const files = new Set();
report.recoveryBatches = [];
for (const sha of [...closures, head.sha]) {
  const f = await github(`contents/ops/editorial/pending-publication-batch.json?ref=${sha}`);
  const manifest = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8'));
  if (sha === head.sha && manifest.phase !== 'closed') continue;
  if (report.recoveryBatches.some(b => b.cycleId === manifest.r1CycleId)) continue;
  if (manifest.phase !== 'closed' || manifest.count !== 5 || new Set(manifest.guideFiles).size !== 5 || new Set(manifest.backlogIds).size !== 5) throw new Error('RELEASE_MANIFEST_NOT_CLOSED');
  report.recoveryBatches.push({ closureSha: sha, cycleId: manifest.r1CycleId, guideFiles: manifest.guideFiles, backlogIds: manifest.backlogIds });
  for (const file of manifest.guideFiles) files.add(file);
}
// Include every recovery ledger on the checked-out canonical main, not only a
// stale hard-coded list of historical manifests plus the latest batch.
for (const name of (await fs.readdir('ops/editorial/publication-ledger/astro')).filter(n=>n.endsWith('.json'))) {
  const row=JSON.parse(await fs.readFile('ops/editorial/publication-ledger/astro/'+name,'utf8'));
  if (Date.parse(row.published_at)>=Date.parse('2026-11-12T03:56:44Z')) {
    if (!/^[a-z0-9-]+$/.test(row.slug)) throw new Error('RECOVERY_LEDGER_SLUG_INVALID');
    files.add('src/data/guides/'+row.slug+'.js');
  }
}
const expected = Object.fromEntries(await Promise.all([...files].map(async file => {
  if (!/^src\/data\/guides\/[a-z0-9-]+\.js$/.test(file)) throw new Error('RELEASE_GUIDE_PATH_INVALID');
  const blob = await github(`contents/${file}?ref=${head.sha}`);
  return [file.split('/').pop().replace(/\.js$/, ''), createHash('sha256').update(Buffer.from(blob.content, 'base64')).digest('hex')];
})));
report.allRecovery = { count: files.size, expected,
  urls: await Promise.all(Object.keys(expected).map(slug => probeUrl(`https://stripunion.com/guides/${slug}`, 15_000))),
  deployment: await probeDeployment(expected, 15_000, fetch), ledger: [] };
for (const slug of Object.keys(expected)) {
  const blob = await github(`contents/ops/editorial/publication-ledger/astro/${slug}.json?ref=${head.sha}`);
  const row = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'));
  report.allRecovery.ledger.push({ slug, publishedAt: row.published_at, verifiedAt: row.verified_at,
    monotonic: Date.parse(row.verified_at) >= Date.parse(row.published_at) });
}
if (process.env.HOSTINGER_API_TOKEN) {
  const hbase = 'https://developers.hostinger.com/api/hosting/v1/';
  const list = await fetch(hbase+'websites?per_page=100', { headers: { authorization: `Bearer ${process.env.HOSTINGER_API_TOKEN}` } });
  if (list.ok) {
    const data = await list.json();
    const rows = Array.isArray(data) ? data : data.data || [];
    const site = rows.find(w => w.domain === 'stripunion.com');
    if (site?.username && report.hostinger.latestBuild?.id) {
      const prefix = `accounts/${encodeURIComponent(site.username)}/websites/stripunion.com/nodejs/builds/${encodeURIComponent(report.hostinger.latestBuild.id)}`;
      const r = await fetch(hbase+prefix, { headers: { authorization: `Bearer ${process.env.HOSTINGER_API_TOKEN}` } });
      report.hostinger.detailHttp = r.status;
      if (r.ok) {
        const detail = await r.json();
        const d = detail.data || detail;
        const candidates = [];
        function collect(value, prefix = '') {
          if (!value || typeof value !== 'object') return;
          for (const [k,v] of Object.entries(value)) {
            const field = prefix + k;
            if (/commit|revision|sha/i.test(k) && typeof v === 'string' && /^[a-f0-9]{40}$/.test(v)) candidates.push({ field, sha:v });
            else if (v && typeof v === 'object') collect(v, field+'.');
          }
        }
        collect(d);
        report.hostinger.providerCommitCandidates = candidates;
        report.hostinger.detailFields = Object.keys(d).filter(k => /^[\w-]{1,80}$/.test(k));
      }
    }
  }
}
const main = report.health.find(r => r.host === 'stripunion.com' && r.path === '/');
const robots = report.health.find(r => r.host === 'stripunion.com' && r.path === '/robots.txt');
const sitemap = report.health.find(r => r.host === 'stripunion.com' && r.path === '/sitemap.xml');
const readOnlyRuns = new Set(['Build','Hostinger Read-only Acceptance','Visual QA','Ecosystem public health','Editorial production snapshot']);
report.gates = {
  sendsPaused: report.frozenSwitches.SOCIAL_OUTBOX_SEND_ENABLED === 'false' && Object.entries(report.frozenSwitches).filter(([k])=>k!=='SOCIAL_OUTBOX_SEND_ENABLED').every(([,v])=>['false','UNSET'].includes(v)),
  receiptSuccessful: report.receipt.status === 'success',
  noMainActiveWriters: report.activeInventoryComplete && report.mainActiveRuns.every(r => readOnlyRuns.has(r.name) || [37655513979,37655528917].includes(r.id)) && report.queueReview.filter(r=>[37655513979,37655528917].includes(r.id)).every(r=>r.jobCount===0),
  productionBuildComplete: report.hostinger.mainFound && report.hostinger.canonicalRepository && report.hostinger.branch === 'main' && report.hostinger.latestBuild?.state === 'completed',
  productionHtml: main?.status===200 && main.finalHost==='stripunion.com' && main.ga4MeasurementIds.includes('G-K57BRX69X1') && main.gtagScriptPresent && main.consentDefaultDenied && main.clarityPresent && main.canonical==='https://stripunion.com/',
  robotsSitemap: robots?.status===200 && robots.blocksAll===false && sitemap?.status===200 && sitemap.validXml,
  recoveryGuides: files.size>=report.recoveryBatches.length*5 && files.size%5===0 && report.allRecovery.urls.every(p=>p.status===200) && report.allRecovery.deployment.ok && report.allRecovery.ledger.every(r=>r.monotonic)
};
if (checkpoint?.phase === 'post' && checkpoint.releaseNumber === 190) {
  const sitemapXml=await (await fetch('https://stripunion.com/sitemap.xml',{signal:AbortSignal.timeout(20000)})).text();
  report.guideDiscoveryChecks=[];
  const slugs=Object.keys(expected);
  for(let offset=0;offset<slugs.length;offset+=8) {
    const batch=await Promise.all(slugs.slice(offset,offset+8).map(async slug=>{
      const url='https://stripunion.com/guides/'+slug+'/';
      const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
      const html=await response.text();
      return {slug,status:response.status,canonicalMatched:html.includes('rel="canonical" href="'+url+'"'),schemaMatched:html.includes('"@id":"'+url+'"'),sitemapMatched:sitemapXml.includes('<loc>'+url+'</loc><lastmod>'),htmlSha256:createHash('sha256').update(html).digest('hex')};
    }));
    report.guideDiscoveryChecks.push(...batch);
  }
  report.gates.guideDiscovery=report.guideDiscoveryChecks.length===files.size && report.guideDiscoveryChecks.every(x=>x.status===200&&x.canonicalMatched&&x.schemaMatched&&x.sitemapMatched);
}
report.mainHtmlSha256 = main?.htmlSha256 || null;
report.phase = checkpoint?.phase || 'pre';
report.releaseNumber = checkpoint?.releaseNumber || 183;
if (checkpoint?.phase === 'post') {
  const merge = await github(`commits/${checkpoint.expectedMergeSha}`);
  const ancestry = await github(`compare/${checkpoint.expectedMergeSha}...main`);
  report.release = { mergeSha: checkpoint.expectedMergeSha, mergeTime: merge.commit.committer.date, rollbackBuild: checkpoint.rollbackBuild,
    providerExactCommitKnown: report.hostinger.providerCommitCandidates?.length > 0 };
  report.gates.postMergeMainAncestry = ['ahead','identical'].includes(ancestry.status);
  report.gates.newProductionBuild = report.hostinger.latestBuild?.id !== checkpoint.rollbackBuild.id &&
    Date.parse(report.hostinger.latestBuild?.createdAt) >= Date.parse(merge.commit.committer.date);
  if (report.releaseNumber === 189) {
    report.searchHubChecks = [];
    for (const slug of ['stripchat-alternatives','stripchat-app','livejasmin','chaturbate-alternatives','xhamster']) {
      const url = 'https://stripunion.com/'+slug+'/';
      const response = await fetch(url,{signal:AbortSignal.timeout(15000)});
      const html = await response.text();
      report.searchHubChecks.push({slug,status:response.status,htmlSha256:createHash('sha256').update(html).digest('hex'),canonicalMatched:html.includes('rel="canonical" href="'+url+'"'),intentNavigation:html.includes('Choose the guide for your question'),appDisclosure:slug!=='stripchat-app'||html.includes('separate affiliate browsing route')});
    }
    const r=await fetch('https://stripunion.com/sitemap.xml',{signal:AbortSignal.timeout(15000)});const xml=await r.text();
    report.gates.searchHubs = report.searchHubChecks.every(x=>x.status===200&&x.canonicalMatched&&x.intentNavigation&&x.appDisclosure);
    report.gates.hubSitemap = r.status===200&&report.searchHubChecks.every(x=>xml.includes('<loc>https://stripunion.com/'+x.slug+'/</loc>'));
  }
  if (report.releaseNumber === 182) {
    const r = await fetch('https://stripunion.com/privacy-policy/', { signal: AbortSignal.timeout(15000) });
    const html = await r.text();
    report.gates.consentReleaseMarker = r.status === 200 && html.includes('Rejecting analytics or withdrawing that choice stops new optional first-party click events');
  }
}
await fs.writeFile('work/recovery/release-183.json', JSON.stringify(report,null,2)+'\n');
console.log('RELEASE_183_ACCEPTANCE '+JSON.stringify({ runId:report.runId,checkedAt:report.checkedAt,releaseNumber:report.releaseNumber,phase:report.phase,release:report.release,mainSha:report.mainSha,gates:report.gates,
  searchHubChecks:report.searchHubChecks,switches:report.frozenSwitches,receipt:report.receipt,hostinger:report.hostinger,guideCount:files.size,
  guideEvidenceSha256:createHash('sha256').update(JSON.stringify(expected)).digest('hex'),mainHtmlSha256:report.mainHtmlSha256 }));
// Natural production is allowed to continue after the merge. Receipt/writer
// assertions remain visible but are pre-merge admission gates, not evidence
// that a completed site build failed while a new legitimate cycle is running.
const required = report.phase === 'post'
  ? ['sendsPaused','productionBuildComplete','productionHtml','robotsSitemap','recoveryGuides','postMergeMainAncestry','newProductionBuild']
  : Object.keys(report.gates);
if (report.phase === 'post' && report.releaseNumber === 182) required.push('consentReleaseMarker');
if (report.phase === 'post' && report.releaseNumber === 189) required.push('searchHubs','hubSitemap');
if (report.phase === 'post' && report.releaseNumber === 190) required.push('guideDiscovery');
if (!required.every(k => report.gates[k] === true)) process.exitCode=1;
