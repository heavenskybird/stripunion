import { readFile } from 'node:fs/promises';
import { canonicalGscRecords, adaptBing, deduplicate } from './engine.mjs';

// Explicit local files only. No collectors imported; no network or repository writes.
const [domainPath, blogPath, bingPath] = process.argv.slice(2);
if (!domainPath) throw new Error('Usage: node report.mjs DOMAIN.json [BLOG.json] [BING.json]');
const read = async file => file ? JSON.parse(await readFile(file, 'utf8')) : null;
const [domain, blog, bing] = await Promise.all([read(domainPath), read(blogPath), read(bingPath)]);
const records = deduplicate([...canonicalGscRecords(domain, blog), ...(bing ? adaptBing(bing) : [])]);
console.log(JSON.stringify({ schema_version: 0, mode: 'offline-snapshot-report',
  limitations: ['Historical observations; not current rankings or production readiness.',
    'Blog prefix excluded when Domain data exists. No totals across engines or overlapping dates.',
    'NULL means unknown. Monthly volumes, organic difficulty, competitor ranks and query revenue unavailable.',
    'Opportunity scoring requires explicit evidence-backed inputs; omitted for these uncalibrated observations.'],
  records }, null, 2));
