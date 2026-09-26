import fs from 'node:fs/promises';
import path from 'node:path';

const rawRoot = path.join('data', 'raw');
const reportsRoot = path.join('data', 'reports');

async function latestSnapshot(filename) {
  const dirs = (await fs.readdir(rawRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const dir of dirs) {
    const target = path.join(rawRoot, dir, filename);
    try {
      const raw = await fs.readFile(target, 'utf8');
      return { date: dir, data: JSON.parse(raw) };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  return null;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function aggregate(rows, keyField, valueField) {
  const map = new Map();
  for (const row of rows) {
    const key = row[keyField] || '(not set)';
    map.set(key, (map.get(key) || 0) + Number(row[valueField] || 0));
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

const gsc = await latestSnapshot('gsc.json');
const ga4 = await latestSnapshot('ga4.json');

if (!ga4) throw new Error('No GA4 snapshot found');

const landingRows = ga4.data.rows || [];
const eventRows = ga4.data.eventRows || [];
const sessions = sum(landingRows, 'sessions');
const engagedSessions = sum(landingRows, 'engagedSessions');
const topSources = aggregate(landingRows, 'sessionSourceMedium', 'sessions').slice(0, 8);
const topLandingPages = aggregate(landingRows, 'landingPagePlusQueryString', 'sessions').slice(0, 8);
const events = aggregate(eventRows, 'eventName', 'eventCount');
const affiliateClicks = events.find((item) => item.key === 'affiliate_click')?.value || 0;

const dailyRows = gsc?.data?.dailyRows || [];
const pageRows = gsc?.data?.pageRows || [];
const queryRows = gsc?.data?.queryRows || [];
const gscClicks = sum(dailyRows, 'clicks');
const gscImpressions = sum(dailyRows, 'impressions');

const ctrOpportunities = queryRows
  .filter((row) => Number(row.impressions || 0) >= 2 && Number(row.clicks || 0) === 0)
  .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0))
  .slice(0, 10);

const rankingOpportunities = queryRows
  .filter((row) => Number(row.position || 0) >= 4 && Number(row.position || 0) <= 20)
  .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0))
  .slice(0, 10);

const pagePerformance = aggregate(pageRows, 'page', 'impressions').slice(0, 10);

const reportDate = new Date().toISOString().slice(0, 10);
await fs.mkdir(reportsRoot, { recursive: true });

const summary = {
  generatedAt: new Date().toISOString(),
  sourceDates: {
    gsc: gsc?.date || null,
    ga4: ga4.date
  },
  ga4: {
    sessions,
    engagedSessions,
    engagementRate: sessions ? engagedSessions / sessions : 0,
    affiliateClicks,
    topSources,
    topLandingPages,
    topEvents: events.slice(0, 12)
  },
  gsc: {
    clicks: gscClicks,
    impressions: gscImpressions,
    ctr: gscImpressions ? gscClicks / gscImpressions : 0,
    ctrOpportunities,
    rankingOpportunities,
    topPagesByImpressions: pagePerformance
  }
};

const md = [
  `# StripUnion Growth Report — ${reportDate}`,
  '',
  '## Traffic',
  `- Sessions: **${sessions}**`,
  `- Engaged sessions: **${engagedSessions}** (${pct(summary.ga4.engagementRate)})`,
  `- Affiliate click events: **${affiliateClicks}**`,
  '',
  '### Top acquisition sources',
  ...topSources.map((item) => `- ${item.key}: ${item.value} sessions`),
  '',
  '### Top landing pages',
  ...topLandingPages.map((item) => `- ${item.key}: ${item.value} sessions`),
  '',
  '## Google Search',
  `- Clicks: **${gscClicks}**`,
  `- Impressions: **${gscImpressions}**`,
  `- CTR: **${pct(summary.gsc.ctr)}**`,
  '',
  '### CTR opportunities',
  ...(ctrOpportunities.length
    ? ctrOpportunities.map((row) => `- ${row.query}: ${row.impressions} impressions, position ${Number(row.position || 0).toFixed(1)}`)
    : ['- None yet / insufficient query volume.']),
  '',
  '### Ranking opportunities (positions 4–20)',
  ...(rankingOpportunities.length
    ? rankingOpportunities.map((row) => `- ${row.query}: position ${Number(row.position || 0).toFixed(1)}, ${row.impressions} impressions`)
    : ['- None yet / insufficient query volume.']),
  '',
  '## Conversion instrumentation',
  affiliateClicks > 0
    ? '- affiliate_click events are being observed in GA4.'
    : '- No affiliate_click events observed yet. Keep instrumentation active and verify after the first real affiliate CTA click.',
  ''
].join('\n');

await fs.writeFile(path.join(reportsRoot, `${reportDate}.json`), JSON.stringify(summary, null, 2) + '\n');
await fs.writeFile(path.join(reportsRoot, `${reportDate}.md`), md + '\n');
console.log(md);
