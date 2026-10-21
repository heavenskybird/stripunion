// Treat a recent, successfully crawled Bing sitemap feed as *secondary*
// evidence when a single public HTTP probe is inconclusive. Never treat a
// stale feed or a different host's sitemap as proof of current accessibility.
export function recentSuccessfulBingSitemap(feeds, siteUrl, nowMs = Date.now(), maxAgeDays = 7) {
  let origin;
  try { origin = new URL(siteUrl).origin; } catch { return null; }
  const allowed = new Set(['/sitemap.xml','/sitemap_index.xml','/wp-sitemap.xml']);
  const maxAgeMs = maxAgeDays * 86400000;
  for (const feed of Array.isArray(feeds) ? feeds : []) {
    let url;
    try { url = new URL(feed?.Url); } catch { continue; }
    if (url.origin !== origin || !allowed.has(url.pathname)) continue;
    if (String(feed?.Status || '').toLowerCase() !== 'success') continue;
    if (Number(feed?.UrlCount || 0) < 1) continue;
    const match = String(feed?.LastCrawled || '').match(/\/Date\((\d+)\)\//);
    const crawledAt = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(crawledAt) || crawledAt > nowMs || nowMs - crawledAt > maxAgeMs) continue;
    return { url: url.toString(), crawledAt: new Date(crawledAt).toISOString(), urlCount: Number(feed.UrlCount) };
  }
  return null;
}
