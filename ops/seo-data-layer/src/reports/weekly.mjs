import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawRoot = path.join(packageRoot, 'data', 'raw');
const reportsRoot = path.join(packageRoot, 'data', 'reports');

async function latestSnapshot(filename) {
  let dirs = [];
  try { dirs = (await fs.readdir(rawRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse(); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  for (const dir of dirs) {
    try { return { date: dir, data: JSON.parse(await fs.readFile(path.join(rawRoot, dir, filename), 'utf8')) }; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  return null;
}

const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
function aggregate(rows, keyField, valueField) {
  const map = new Map();
  for (const row of rows) { const key = row[keyField] || '(not set)'; map.set(key, (map.get(key) || 0) + Number(row[valueField] || 0)); }
  return [...map.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const gsc = await latestSnapshot('gsc.json');
const ga4 = await latestSnapshot('ga4.json');
const bing = await latestSnapshot('bing.json');
const buffer = await latestSnapshot('buffer.json');

const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - 7);
const inLastWeek = (value) => {
  if (!value) return true;
  const normalized = String(value).length === 8 ? `${String(value).slice(0, 4)}-${String(value).slice(4, 6)}-${String(value).slice(6, 8)}` : String(value);
  return new Date(`${normalized}T00:00:00Z`) >= cutoff;
};
const landingRows = (ga4?.data?.rows || []).filter((row) => inLastWeek(row.date));
const eventRows = (ga4?.data?.eventRows || []).filter((row) => inLastWeek(row.date));
const events = aggregate(eventRows, 'eventName', 'eventCount');
const affiliateClicks = events.find((item) => item.key === 'affiliate_click')?.value || 0;
const dailyRows = (gsc?.data?.dailyRows || []).filter((row) => inLastWeek(row.date));
const queryRows = gsc?.data?.queryRows || [];
const pageRows = gsc?.data?.pageRows || [];
const gscClicks = sum(dailyRows, 'clicks');
const gscImpressions = sum(dailyRows, 'impressions');
const bingSites = bing?.data?.sites || [];
const bingQueries = bingSites.flatMap((site) => (site.queryStats || []).map((row) => ({ ...row, site: site.site })));
const bingPages = bingSites.flatMap((site) => (site.pageStats || []).map((row) => ({ ...row, site: site.site })));
const bingCrawl = bingSites.flatMap((site) => (site.crawlStats || []).map((row) => ({ ...row, site: site.site })));
const bingErrors = bingSites.flatMap((site) => (site.crawlIssues || []).map((row) => ({ ...row, site: site.site })));
const sentPosts = buffer?.data?.sentPosts || [];
const scheduledPosts = buffer?.data?.scheduledPosts || [];

const ctrOpportunities = queryRows.filter((row) => Number(row.impressions || 0) >= 2 && Number(row.ctr || 0) < 0.02)
  .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0)).slice(0, 10);
const rankingOpportunities = queryRows.filter((row) => Number(row.position || 0) >= 4 && Number(row.position || 0) <= 20)
  .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0)).slice(0, 10);
const bingZeroClickQueries = bingQueries.filter((row) => Number(row.Impressions || 0) > 0 && Number(row.Clicks || 0) === 0).slice(0, 10);
const bingZeroClickPages = bingPages.filter((row) => Number(row.Impressions || 0) > 0 && Number(row.Clicks || 0) === 0).slice(0, 10);
const highPerformingPosts = sentPosts.map((post) => ({ ...post, _score: Number(post.metrics?.engagementRate || 0) || Number(post.metrics?.clicks || 0) + Number(post.metrics?.reactions || 0) + Number(post.metrics?.comments || 0) + Number(post.metrics?.reposts || 0) }))
  .filter((post) => post.metrics?.impressions != null || post.metrics?.clicks != null || post.metrics?.reactions != null)
  .sort((a, b) => b._score - a._score).slice(0, 10).map(({ _score, ...post }) => post);

let previousBing = null;
if (bing) {
  const dirs = (await fs.readdir(rawRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  for (const dir of dirs) {
    if (dir >= bing.date) continue;
    try { previousBing = { date: dir, data: JSON.parse(await fs.readFile(path.join(rawRoot, dir, 'bing.json'), 'utf8')) }; break; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}
const indexTotals = (snapshot) => (snapshot?.data?.sites || []).map((site) => {
  const latest = (site.indexedPages || []).filter((row) => row.indexed != null).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return { site: site.site, indexed: latest ? Number(latest.indexed) : null };
});
const currentIndex = indexTotals(bing);
const previousIndex = new Map(indexTotals(previousBing).map((item) => [item.site, item.indexed]));
const indexChanges = currentIndex.map((item) => ({ ...item, previousIndexed: previousIndex.get(item.site) ?? null, change: previousIndex.has(item.site) ? item.indexed - previousIndex.get(item.site) : null }));
const reportDate = new Date().toISOString().slice(0, 10);
await fs.mkdir(reportsRoot, { recursive: true });

const summary = {
  generatedAt: new Date().toISOString(),
  sourceDates: { gsc: gsc?.date || null, ga4: ga4?.date || null, bing: bing?.date || null, buffer: buffer?.date || null },
  sources: { gsc: Boolean(gsc), ga4: Boolean(ga4), bing: Boolean(bing), buffer: Boolean(buffer) },
  google: {
    clicks: gscClicks, impressions: gscImpressions, ctr: gscImpressions ? gscClicks / gscImpressions : 0,
    averagePosition: gscImpressions ? dailyRows.reduce((total, row) => total + Number(row.position || 0) * Number(row.impressions || 0), 0) / gscImpressions : null,
    rankingOpportunities, highImpressionWeakCtr: ctrOpportunities,
    topPagesByImpressions: aggregate(pageRows, 'page', 'impressions').slice(0, 10)
  },
  bing: {
    clicks: sum(bingQueries, 'Clicks'), impressions: sum(bingQueries, 'Impressions'),
    highImpressionZeroClickQueries: bingZeroClickQueries, highImpressionZeroClickPages: bingZeroClickPages,
    crawlErrors: bingCrawl.map((row) => ({ site: row.site, date: row.Date, errors: Number(row.CrawlErrors || 0), http4xx: Number(row.Code4xx || 0), http5xx: Number(row.Code5xx || 0) })),
    crawlIssues: bingErrors, indexChanges
  },
  ga4: {
    sessions: sum(landingRows, 'sessions'), engagedSessions: sum(landingRows, 'engagedSessions'),
    engagementRate: sum(landingRows, 'sessions') ? sum(landingRows, 'engagedSessions') / sum(landingRows, 'sessions') : 0,
    acquisitionSources: aggregate(landingRows, 'sessionSourceMedium', 'sessions').slice(0, 8),
    landingPages: aggregate(landingRows, 'landingPagePlusQueryString', 'sessions').slice(0, 10),
    affiliateClick: affiliateClicks, conversions: null, revenue: sum(landingRows, 'totalRevenue'), events: events.slice(0, 12)
  },
  buffer: {
    channel: buffer?.data?.channel || null, sentPostCount: sentPosts.length, scheduledPostCount: scheduledPosts.length,
    impressions: sum(sentPosts.map((post) => post.metrics || {}), 'impressions'), clicks: sum(sentPosts.map((post) => post.metrics || {}), 'clicks'),
    engagement: { reactions: sum(sentPosts.map((post) => post.metrics || {}), 'reactions'), comments: sum(sentPosts.map((post) => post.metrics || {}), 'comments'), reposts: sum(sentPosts.map((post) => post.metrics || {}), 'reposts'), reach: sum(sentPosts.map((post) => post.metrics || {}), 'reach') },
    metricsUpdatedAt: sentPosts.map((post) => post.metricsUpdatedAt).filter(Boolean).sort().at(-1) || null,
    highestPerformingPosts: highPerformingPosts, sentPosts, scheduledPosts
  }
};

const md = [
  `# StripUnion Growth Report — ${reportDate}`, '',
  `Sources: GSC ${gsc ? `(${gsc.date})` : 'missing'} · GA4 ${ga4 ? `(${ga4.date})` : 'missing'} · Bing ${bing ? `(${bing.date})` : 'missing'} · Buffer ${buffer ? `(${buffer.date})` : 'missing'}.`, '',
  '## Google Search', `- Clicks: **${gscClicks}**`, `- Impressions: **${gscImpressions}**`, `- CTR: **${pct(summary.google.ctr)}**`, '',
  '### Positions 4–20', ...(rankingOpportunities.length ? rankingOpportunities.map((row) => `- ${row.query}: position ${Number(row.position).toFixed(1)}, ${row.impressions} impressions`) : ['- No rows available.']), '',
  '### High-impression, weak-CTR queries', ...(ctrOpportunities.length ? ctrOpportunities.map((row) => `- ${row.query}: ${row.impressions} impressions, ${pct(Number(row.ctr || 0))} CTR`) : ['- None identified.']), '',
  '## Bing', `- Clicks: **${summary.bing.clicks}** · Impressions: **${summary.bing.impressions}**`, `- Crawl issues: **${bingErrors.length}** URLs`,
  ...bingCrawl.map((row) => `- ${row.site}: ${row.CrawlErrors || 0} crawl errors; ${row.InIndex ?? 'unknown'} indexed`),
  '### High-impression, zero-click queries/pages', ...[...bingZeroClickQueries.map((row) => `- Query ${row.Query}: ${row.Impressions} impressions`), ...bingZeroClickPages.map((row) => `- Page ${row.Query}: ${row.Impressions} impressions`)].slice(0, 10), '',
  '## GA4', `- Sessions: **${summary.ga4.sessions}** · engaged: **${summary.ga4.engagedSessions}** (${pct(summary.ga4.engagementRate)})`, `- affiliate_click: **${affiliateClicks}** · revenue: **${summary.ga4.revenue}**`,
  ...summary.ga4.acquisitionSources.map((item) => `- Source ${item.key}: ${item.value} sessions`), '',
  '## Buffer / X', `- Sent posts: **${sentPosts.length}** · scheduled: **${scheduledPosts.length}**`, `- Impressions: **${summary.buffer.impressions}** · clicks: **${summary.buffer.clicks}**`,
  ...highPerformingPosts.slice(0, 5).map((post) => `- ${String(post.text || '').replace(/\s+/g, ' ').slice(0, 140)} — ${post.metrics?.impressions ?? 'n/a'} impressions, ${post.metrics?.clicks ?? 'n/a'} clicks`), ''
].join('\n');

await fs.writeFile(path.join(reportsRoot, `${reportDate}.json`), JSON.stringify(summary, null, 2) + '\n');
await fs.writeFile(path.join(reportsRoot, `${reportDate}.md`), md + '\n');
console.log(md);
