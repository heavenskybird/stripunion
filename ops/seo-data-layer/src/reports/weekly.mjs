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
const hostnameForUrl = (value) => { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };
const siteForHost = (host) => host === 'blog.stripunion.com' ? 'blog' : host === 'stripunion.com' ? 'main' : 'other';
const siteGaRows = Object.fromEntries(['main', 'blog', 'other'].map((site) => [site, landingRows.filter((row) => siteForHost(String(row.hostName || '').toLowerCase().replace(/^www\./, '')) === site)]));
const siteEventRows = Object.fromEntries(['main', 'blog', 'other'].map((site) => [site, eventRows.filter((row) => siteForHost(String(row.hostName || '').toLowerCase().replace(/^www\./, '')) === site)]));
const gaHostSegmentationAvailable = Boolean(ga4 && landingRows.length > 0 && landingRows.every((row) => Object.hasOwn(row, 'hostName')) && eventRows.every((row) => Object.hasOwn(row, 'hostName')));
const gaSiteMetrics = (site) => ({
  sessions: sum(siteGaRows[site], 'sessions'), engagedSessions: sum(siteGaRows[site], 'engagedSessions'),
  affiliateClick: sum(siteEventRows[site].filter((row) => row.eventName === 'affiliate_click'), 'eventCount'),
  revenue: sum(siteGaRows[site], 'totalRevenue')
});
const gscSiteRows = Object.fromEntries(['main', 'blog', 'other'].map((site) => [site, pageRows.filter((row) => siteForHost(hostnameForUrl(row.page)) === site)]));
const gscHostSegmentationAvailable = Boolean(gsc && pageRows.length > 0 && pageRows.every((row) => Object.hasOwn(row, 'page')));
const gscSiteMetrics = (site) => ({ clicks: sum(gscSiteRows[site], 'clicks'), impressions: sum(gscSiteRows[site], 'impressions') });
const bingSiteCoverage = ['stripunion.com', 'blog.stripunion.com'].map((hostname) => {
  const site = bingSites.find((item) => String(item.site || '').toLowerCase().replace(/^www\./, '') === hostname);
  return { hostname, configured: Boolean(site), methods: site?.methodStatus || null };
});

const ctrOpportunities = queryRows.filter((row) => Number(row.impressions || 0) >= 2 && Number(row.ctr || 0) < 0.02)
  .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0)).slice(0, 10);
const rankingOpportunities = queryRows.filter((row) => Number(row.position || 0) >= 4 && Number(row.position || 0) <= 20)
  .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0)).slice(0, 10);
const bingZeroClickQueries = bingQueries.filter((row) => Number(row.Impressions || 0) > 0 && Number(row.Clicks || 0) === 0).slice(0, 10);
const bingZeroClickPages = bingPages.filter((row) => Number(row.Impressions || 0) > 0 && Number(row.Clicks || 0) === 0).slice(0, 10);
const bingCoverageSummary = bingSiteCoverage.map((site) => `- ${site.hostname}: ${site.configured ? `configured; methods ${Object.values(site.methods || {}).filter((status) => status === 'ok').length}/4 succeeded` : 'BLOG BING COVERAGE NOT VERIFIED'}${site.configured && !Object.values(site.methods || {}).every((status) => status === 'ok') ? `; status ${JSON.stringify(site.methods)}` : ''}`);
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
    siteSegmentationAvailable: gscHostSegmentationAvailable,
    sites: gscHostSegmentationAvailable ? { main: gscSiteMetrics('main'), blog: gscSiteMetrics('blog'), other: gscSiteMetrics('other') } : null,
    rankingOpportunities, highImpressionWeakCtr: ctrOpportunities,
    topPagesByImpressions: aggregate(pageRows, 'page', 'impressions').slice(0, 10)
  },
  bing: {
    clicks: sum(bingQueries, 'Clicks'), impressions: sum(bingQueries, 'Impressions'),
    siteCoverage: bingSiteCoverage,
    highImpressionZeroClickQueries: bingZeroClickQueries, highImpressionZeroClickPages: bingZeroClickPages,
    crawlErrors: bingCrawl.map((row) => ({ site: row.site, date: row.Date, g^¸òÚ$z{-®éÜj×&–ærò²rÒ&–ær6æ6†÷BÖ—76–ærâuÒ¢µÒ’À¢âââ†vBbbv†÷7E6VvÖVçFF–öäf–Æ&ÆRò²rÒtB†÷7FæÖR6VvÖVçFF–öâVæf–Æ&ÆRf÷"ÆVv7’&÷w3²&W'VâF†RtB6öÆÆV7F÷"Fò÷VÆFR6—FRF÷FÇ2âuÒ¢µÒ’À¢âââ†w62bbw64†÷7E6VvÖVçFF–öäf–Æ&ÆRò²rÒu42†÷7FæÖR6VvÖVçFF–öâVæf–Æ&ÆS¢vRFF†2æòW6&ÆRvR&÷w2âF–Ç’u42F÷FÇ2&R7F–ÆÂf–Æ&ÆRf÷"F†RFöÖ–â&÷W'G’âuÒ¢µÒ’À¢ââæ&–æu6—FT6÷fW&vRæf–ÇFW"‚‡6—FR’Óâ6—FRæ6öæf–wW&VB’æÖ‚‡6—FR’ÓâÒ$Äôr$”är4õdU$tRäõBdU$”d”TC¢G·6—FRæ†÷7FæÖWÒ—2æ÷B&W6VçB–âF†RÆFW7B6öæf–wW&VB÷&WGW&æVB&–ær6—FW2âFB—BFòfW&–f–VB&–ærvV&Ö7FW"6—FW2æB$”äuõ4•DUõU$Å2æ’À¢ââæ&–æu6—FT6÷fW&vRæf–ÇFW"‚‡6—FR’Óâ6—FRæ6öæf–wW&VBbb‚6—FRæÖWF†öG2ÇÂö&¦V7BçfÇVW2‡6—FRæÖWF†öG2’ç6öÖR‚‡7FGW2’Óâ7FGW2ÓÒvö²r’’’æÖ‚‡6—FR’ÓâÒ&–ær'F–ÂöW'&÷"6÷fW&vRf÷"G·6—FRæ†÷7FæÖWÓ¢G´¥4ôâç7G&–æv–g’‡6—FRæÖWF†öG2—Òæ’ÂrrÀ¢r226V&6‚FWF–ÂrÂÒ6öÖ&–æVBu43¢¢¢G¶w646Æ–6·7Ò¢¢6Æ–6·2+r¢¢G¶w64–×&W76–öç7Ò¢¢–×&W76–öç2+r¢¢G·7B‡7VÖÖ'’ævöövÆRæ7G"—Ò¢¢5E"æÀ¢âââ†7G$÷÷'GVæ—F–W2æÆVæwF‚ò7G$÷÷'GVæ—F–W2ç6Æ–6RƒÂR’æÖ‚‡&÷r’ÓâÒvV²5E#¢G·&÷rçVW'—Ò(	BG·&÷ræ–×&W76–öç7Ò–×&W76–öç2ÂG·7B„çVÖ&W"‡&÷ræ7G"ÇÂ’—Ò5E&’¢µÒ’ÂrrÀ¢r22&–ærrÂÒ6öÖ&–æVC¢¢¢G·7VÖÖ'’æ&–æræ6Æ–6·7Ò¢¢6Æ–6·2+r¢¢G·7VÖÖ'’æ&–æræ–×&W76–öç7Ò¢¢–×&W76–öç2+rG¶&–ætW'&÷'2æÆVæwF‡Ò7&vÂ—77VRU$Ç2æÀ¢ââæ&–æt6÷fW&vU7VÖÖ'’À¢ââäö&¦V7BçfÇVW2†&–æt7&vÂç&VGV6R‚†ÆFW7BÂ&÷r’Óâ°¢6öç7BFFRÒ7G&–ær‡&÷räFFRÇÂrr“°¢–b‚ÆFW7E·&÷rç6—FUÒÇÂFFRâ7G&–ær†ÆFW7E·&÷rç6—FUÒäFFRÇÂrr’’ÆFW7E·&÷rç6—FUÒÒ&÷s°¢&WGW&âÆFW7C°¢ÒÂ·Ò’’æÖ‚‡&÷r’ÓâÒG·&÷rç6—FWÓ¢ÆFW7BG·&÷rä7&vÄW'&÷'2ÇÂÒ7&vÂW'&÷'3²G·&÷rä–ä–æFW‚óòwVæ¶æ÷vâwÒ–æFW†VF’ÂrrÀ¢r227V—6—F–öâ6æ6†÷BrÂÒtB6öÖ&–æVC¢¢¢G·7VÖÖ'’ævBç6W76–öç7Ò¢¢6W76–öç2+r¢¢G·7VÖÖ'’ævBæVævvVE6W76–öç7Ò¢¢VævvVB‚G·7B‡7VÖÖ'’ævBæVævvVÖVçE&FR—Ò’+rff–Æ–FUö6Æ–6²¢¢G¶ff–Æ–FT6Æ–6·7Ò¢¢+r&WfVçVRG·7VÖÖ'’ævBç&WfVçVRÇÂvæ÷B6öææV7FVBwÒæÂrrÀ¢r22F—7G&–'WF–öâFWF–ÂrÂÒ'VffW"õƒ¢G·6VçE÷7G2æÆVæwF‡Ò6VçB+rG·66†VGVÆVE÷7G2æÆVæwF‡Ò66†VGVÆVB+rG·7VÖÖ'’æ'VffW"æ–×&W76–öç7Ò–×&W76–öç2+rG·7VÖÖ'’æ'VffW"æ6Æ–6·7Ò6Æ–6·2æÀ¢ââæ†–v…W&f÷&Ö–æu÷7G2ç6Æ–6RƒÂ2’æÖ‚‡÷7B’ÓâÒ÷7BG·÷7Bæ–BÇÂr‡Væ¶æ÷vâ–B’wÓ¢G·÷7BæÖWG&–73òæ–×&W76–öç2óòvâöwÒ–×&W76–öç2ÂG·÷7BæÖWG&–73òæ6Æ–6·2óòvâöwÒ6Æ–6·6’Ârp¥Òæ¦ö–â‚uÆâr“° ¦v—Bg2çw&—FTf–ÆR‡F‚æ¦ö–â‡&W÷'G5&ö÷BÂG·&W÷'DFFWÒæ§6öæ’Â¥4ôâç7G&–æv–g’‡7VÖÖ'’ÂçVÆÂÂ"’²uÆâr“°¦v—Bg2çw&—FTf–ÆR‡F‚æ¦ö–â‡&W÷'G5&ö÷BÂG·&W÷'DFFWÒæÖF’ÂÖB²uÆâr“°¦6öç6öÆRæÆör†ÖB“°