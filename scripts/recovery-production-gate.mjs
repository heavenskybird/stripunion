import fs from 'node:fs/promises';
import './recovery-readonly-evidence.mjs';

const file = 'work/recovery/readonly-evidence.json';
const report = JSON.parse(await fs.readFile(file, 'utf8'));
const main = report.health.find(p => p.host === 'stripunion.com' && p.path === '/');
const robots = report.health.find(p => p.host === 'stripunion.com' && p.path === '/robots.txt');
const sitemap = report.health.find(p => p.host === 'stripunion.com' && p.path === '/sitemap.xml');
const headers = { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' };
async function github(endpoint) {
  const response = await fetch(`https://api.github.com/repos/heavenskybird/stripunion/${endpoint}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`GitHub production gate read failed HTTP${response.status}`);
  return response.json();
}
const [head, merge, ancestry, workerSmoke] = await Promise.all([
  github('commits/main'), github('commits/9883f05bc11fb65a7c6e12f00000eeb79c9b67cb'),
  github('compare/9883f05bc11fb65a7c6e12f00000eeb79c9b67cb...main'), github('actions/runs/43145721142')
]);
report.source = { mainSha: head.sha, mergeSha: merge.sha, mergeTime: merge.commit.committer.date,
  contains170: ['ahead','identical'].includes(ancestry.status) };
report.gates = {
  GA4_TAG_VERIFIED: main?.status === 200 && main.finalHost === 'stripunion.com' && main.gtagScriptPresent &&
    main.ga4MeasurementIds.includes('G-K57BRX69X1') && main.consentDefaultDenied && main.clarityPresent && main.canonical === 'https://stripunion.com/',
  ROBOTS_SITEMAP_VERIFIED: robots?.status === 200 && robots.blocksAll === false && sitemap?.status === 200 && sitemap.validXml,
  PREVIOUS_FIVE_VERIFIED: report.publication.guides.length === 5 && report.publication.guides.every(p => p.ok && p.status === 200) && report.publication.deployment.ok,
  PRODUCTION_BUILD_VERIFIED: report.hostinger.mainFound && report.hostinger.canonicalRepository && report.hostinger.branch === 'main' &&
    ['completed','success','succeeded'].includes(report.hostinger.latestBuild?.state) &&
    Date.parse(report.hostinger.latestBuild.createdAt) >= Date.parse(merge.commit.committer.date) && report.source.contains170,
  WORKER_VERIFIED: report.workerDeployment.deploymentsHttp === 200 && report.workerDeployment.rollbackBaseline?.versions?.some(v => v.versionId === '80c34a62-6d81-43fc-81fe-1d2b3462fc33' && v.percentage === 100) && workerSmoke.conclusion === 'success',
  SCHEDULER_DISABLED: report.scheduler.state === 'disabled_manually',
  SOCIAL_SEND_DISABLED: report.nativeSend.variable === 'false' && report.nativeSend.singleWriter === 'UNSET'
};
report.gates.PRODUCTION_DEPLOYMENT_VERIFIED = ['GA4_TAG_VERIFIED','ROBOTS_SITEMAP_VERIFIED','PREVIOUS_FIVE_VERIFIED','PRODUCTION_BUILD_VERIFIED','WORKER_VERIFIED'].every(k => report.gates[k] === true);
report.identityMethod = 'Production-specific Hostinger build after170 + canonical-main ancestry + actual new GA4 fallback HTML/consent/Clarity + five source SHA256 fingerprints; provider commit SHA remains unavailable.';
await fs.writeFile('work/recovery/production-gate.json', JSON.stringify(report, null, 2) + '\n');
console.log('PRODUCTION_GATE ' + JSON.stringify({ runId: report.runId, source: report.source, gates: report.gates, productionBuild: report.hostinger.latestBuild, mainHtml: main, staging: report.staging }));
if (!report.gates.PRODUCTION_DEPLOYMENT_VERIFIED || !report.gates.SCHEDULER_DISABLED || !report.gates.SOCIAL_SEND_DISABLED) process.exitCode = 1;
