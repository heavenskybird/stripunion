import fs from 'node:fs/promises';
import path from 'node:path';

const rawRoot = path.resolve('ops/seo-data-layer/data/raw');

function fail(message) {
  throw new Error(message);
}

function siteHost(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '').replace(/\/$/, '');
}

function validate(snapshot) {
  const errors = [];
  const requiredHosts = ['stripunion.com', 'blog.stripunion.com'];
  const sites = Array.isArray(snapshot?.sites) ? snapshot.sites : [];

  if (snapshot?.account?.GetUserSites !== 'ok') {
    errors.push('GetUserSites did not succeed.');
  }

  for (const host of requiredHosts) {
    const site = sites.find((row) => siteHost(row.site) === host);
    if (!site) {
      errors.push(`${host}: missing from Bing snapshot.`);
      continue;
    }
    if (site.verified !== true) errors.push(`${host}: Bing verification is not true.`);

    for (const method of ['GetQueryStats','GetPageStats','GetCrawlStats','GetCrawlIssues','GetFeeds','GetLinkCounts','GetUrlLinks']) {
      if (site.methodStatus?.[method] !== 'ok') errors.push(`${host}: ${method} is not healthy.`);
    }

    if (!['already_present','submitted'].includes(site.feedState?.status)) {
      errors.push(`${host}: sitemap feed state is ${site.feedState?.status || 'missing'}.`);
    }

    if (!Array.isArray(site.backlinkPages) || !Array.isArray(site.backlinkDetails)) {
      errors.push(`${host}: backlink arrays are missing.`);
    }
  }

  const research = snapshot?.keywordResearch;
  const seeds = Array.isArray(research?.bySeed) ? research.bySeed : [];
  if (!seeds.length) errors.push('Bing keyword research has no seeds.');

  const healthyKeywordSeeds = seeds.filter((row) =>
    row.methodStatus?.GetKeywordStats === 'ok' &&
    row.methodStatus?.GetRelatedKeywords === 'ok'
  );
  if (!healthyKeywordSeeds.length) {
    errors.push('No Bing keyword seed has both GetKeywordStats and GetRelatedKeywords healthy.');
  }

  return {
    ok: errors.length === 0,
    errors,
    sites: requiredHosts.map((host) => {
      const site = sites.find((row) => siteHost(row.site) === host);
      return {
        host,
        verified: site?.verified === true,
        sitemap: site?.feedState?.status || null,
        backlinkTargets: Array.isArray(site?.backlinkPages) ? site.backlinkPages.length : null,
        backlinkSources: Array.isArray(site?.backlinkDetails) ? site.backlinkDetails.length : null,
        methods: site?.methodStatus || null
      };
    }),
    keywordSeeds: seeds.length,
    healthyKeywordSeeds: healthyKeywordSeeds.length
  };
}

async function latestSnapshot() {
  const dirs = (await fs.readdir(rawRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const dir of dirs) {
    const file = path.join(rawRoot, dir, 'bing.json');
    try {
      return { date: dir, data: JSON.parse(await fs.readFile(file, 'utf8')) };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  fail('No Bing snapshot found.');
}

function selfTest() {
  const site = (host) => ({
    site: host,
    verified: true,
    methodStatus: {
      GetQueryStats:'ok', GetPageStats:'ok', GetCrawlStats:'ok', GetCrawlIssues:'ok',
      GetFeeds:'ok', GetLinkCounts:'ok', GetUrlLinks:'ok'
    },
    feedState: { status:'already_present' },
    backlinkPages: [],
    backlinkDetails: []
  });
  const fixture = {
    account: { GetUserSites:'ok' },
    sites: [site('stripunion.com'), site('blog.stripunion.com')],
    keywordResearch: {
      bySeed: [{ seed:'live cam sites', methodStatus:{ GetKeywordStats:'ok', GetRelatedKeywords:'ok' } }]
    }
  };
  const good = validate(fixture);
  if (!good.ok) fail('Self-test expected valid fixture to pass.');
  fixture.sites[1].verified = false;
  const bad = validate(fixture);
  if (bad.ok || !bad.errors.some((row) => row.includes('verification'))) {
    fail('Self-test expected unverified blog fixture to fail.');
  }
  console.log('Bing intelligence acceptance self-test passed.');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const snapshot = await latestSnapshot();
  const result = validate(snapshot.data);
  console.log(JSON.stringify({ snapshotDate: snapshot.date, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}
