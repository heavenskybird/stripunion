import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await fs.readFile(path.join(root, 'competitors/config.json'), 'utf8'));
const date = new Date().toISOString().slice(0, 10);
const rawDir = path.join(root, 'competitors/data/raw');
const diffDir = path.join(root, 'competitors/data/diffs');
const timeout = (ms) => AbortSignal.timeout(ms);
const strip = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<!--[^]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
const all = (html, regex) => [...html.matchAll(regex)].map((m) => m[1] || '').filter(Boolean);
const textOf = (html, re) => strip(html.match(re)?.[1] || '');
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '';
async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'StripUnionPublicResearch/1.0 (+https://stripunion.com/about)', accept: 'text/html,application/xml,text/plain;q=0.9,*/*;q=0.5' }, signal: timeout(config.timeoutMs), redirect: 'follow' });
  if (new URL(response.url).protocol !== 'https:') throw new Error('non-HTTPS final URL');
  return { response, body: (await response.text()).slice(0, 2_000_000) };
}
function pageSummary(url, html, headers, finalUrl) {
  const tags = all(html, /<(meta|link|script)\b[^>]*>/gi); // tags are intentionally reduced to metadata below
  const meta = tags.filter((tag) => /^<meta\b/i.test(tag));
  const canonical = tags.map((tag) => /^<link\b/i.test(tag) && /\brel\s*=\s*["']canonical["']/i.test(tag) ? attr(tag, 'href') : '').find(Boolean) || null;
  const title = textOf(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i) || null;
  const h1 = textOf(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || null;
  const description = meta.map((tag) => /\bname\s*=\s*["']description["']/i.test(tag) ? attr(tag, 'content') : '').find(Boolean) || null;
  const schemaTypes = [...new Set(all(html, /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi).flatMap((raw) => {
    try { const walk = (v) => Array.isArray(v) ? v.flatMap(walk) : v && typeof v === 'object' ? [...(Array.isArray(v['@type']) ? v['@type'] : v['@type'] ? [v['@type']] : []), ...walk(v['@graph'])] : []; return walk(JSON.parse(raw)); } catch { return []; }
  }))];
  const main = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] || html;
  const links = all(html, /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  const hrefs = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const host = new URL(finalUrl).hostname;
  const assetTags = all(html, /<(?:img|video|source|picture)\b[^>]*>/gi);
  const external = [...new Set(hrefs.map((href) => { try { const u = new URL(href, finalUrl); return u.hostname && u.hostname !== host ? u.hostname : null; } catch { return null; } }).filter(Boolean))].sort();
  const ctas = links.map((value) => strip(value)).filter((value) => value && value.length < 100 && /visit|try|join|sign up|start|explore|compare|read review|view/i.test(value)).slice(0, 40);
  const visibleText = strip(main);
  return { url, finalUrl, status: headers.status, title, h1, metaDescription: description, canonical: canonical ? new URL(canonical, finalUrl).href : null, schemaTypes, updateSignals: { lastModifiedHeader: headers.lastModified || null, dateTokens: [...new Set((main.match(/(?:updated|reviewed|checked|published)[^.!?]{0,40}(?:20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[^.!?]{0,20}/gi) || []).slice(0, 10)] }, approximateWords: visibleText ? visibleText.split(/\s+/).length : 0, internalLinks: hrefs.filter((href) => { try { const u = new URL(href, finalUrl); return u.hostname === host; } catch { return href.startsWith('/'); } }).length, externalDestinations: external, ctaLabels: ctas, comparisonTargets: [...new Set((visibleText.match(/\b(?:vs\.?|versus)\s+[A-Z][A-Za-z0-9]+/g) || []).slice(0, 20))], platformCoverage: [...new Set((visibleText.match(/\b(?:Stripchat|Chaturbate|BongaCams|LiveJasmin|CamSoda|MyFreeCams|Jerkmate|Streamate|OnlyFans)\b/gi) || []).map((v) => v.toLowerCase()))], pricingSignals: { currencyMentions: (visibleText.match(/[$€£]\s?\d+(?:[.,]\d+)?/g) || []).slice(0, 30), tokenMentions: (visibleText.match(/\b\d+(?:[.,]\d+)?\s*(?:tokens?|credits?)\b/gi) || []).slice(0, 30) }, visualAssets: { total: assetTags.length, types: assetTags.map((tag) => tag.match(/^<(\w+)/)?.[1]?.toLowerCase()).reduce((acc, type) => { acc[type] = (acc[type] || 0) + 1; return acc; }, {}) } };
}
async function previous() { try { const names = (await fs.readdir(rawDir)).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse(); return names.length ? JSON.parse(await fs.readFile(path.join(rawDir, names[0]), 'utf8')) : null; } catch { return null; } }
const prior = await previous();
const snapshots = [];
for (const competitor of config.domains) {
  const host = new URL(competitor.origin).hostname;
  const entry = { name: competitor.name, origin: competitor.origin, evidence: competitor.canonicalEvidence, pages: [], errors: [] };
  try {
    const { response, body } = await fetchText(new URL('/robots.txt', competitor.origin));
    const sitemapLocs = [...body.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    const sitemapUrls = sitemapLocs.length ? sitemapLocs : [new URL('/sitemap.xml', competitor.origin).href];
    const urls = new Set([new URL('/', competitor.origin).href]);
    for (const sitemap of sitemapUrls.slice(0, 4)) {
      try { const { body: xml } = await fetchText(sitemap); for (const m of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) { const u = new URL(m[1].trim()); if (u.hostname === host && u.protocol === 'https:') urls.add(u.href); if (urls.size >= config.maxPagesPerDomain) break; } } catch (error) { entry.errors.push(`sitemap: ${error.message}`); }
    }
    entry.robotsStatus = response.status;
    const bounded = [...urls].slice(0, config.maxPagesPerDomain);
    entry.sitemapUrls = bounded;
    for (const url of bounded) {
      try { const { response: pageResponse, body: html } = await fetchText(url); if (pageResponse.status >= 200 && pageResponse.status < 400 && /text\/html/i.test(pageResponse.headers.get('content-type') || 'text/html')) entry.pages.push(pageSummary(url, html, { status: pageResponse.status, lastModified: pageResponse.headers.get('last-modified') }, pageResponse.url)); }
      catch (error) { entry.errors.push(`${new URL(url).pathname}: ${error.message}`); }
    }
  } catch (error) { entry.errors.push(`robots: ${error.message}`); }
  snapshots.push(entry);
}
const previousByName = new Map((prior?.competitors || []).map((c) => [c.name, new Set(c.sitemapUrls || [])]));
const diffs = snapshots.map((c) => { const before = previousByName.get(c.name) || new Set(); const now = new Set(c.sitemapUrls); return { name: c.name, newUrls: [...now].filter((u) => !before.has(u)), removedUrls: [...before].filter((u) => !now.has(u)), pageCount: now.size, collectionErrors: c.errors }; });
await fs.mkdir(rawDir, { recursive: true }); await fs.mkdir(diffDir, { recursive: true });
await fs.writeFile(path.join(rawDir, `${date}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), source: 'public pages and public sitemaps; no page body stored', limits: { maxPagesPerDomain: config.maxPagesPerDomain, bodyBytesPerRequest: 2_000_000 }, competitors: snapshots }, null, 2) + '\n');
await fs.writeFile(path.join(diffDir, `${date}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), comparedTo: prior?.date || null, competitors: diffs }, null, 2) + '\n');
console.log(`Competitor collection ${date}: ${snapshots.reduce((n, c) => n + c.pages.length, 0)} pages; ${snapshots.filter((c) => c.errors.length).length} domains with collection warnings.`);
