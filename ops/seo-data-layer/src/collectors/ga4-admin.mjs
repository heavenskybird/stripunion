import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoDate } from '../lib/io.mjs';

const propertyId = process.env.GA4_PROPERTY_ID || '530171093';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function classifyStreams(streams = []) {
  const production = streams.map((stream) => {
    try {
      const host = new URL(stream.defaultUri).hostname.toLowerCase().replace(/^www\./, '');
      return { stream, host };
    } catch { return null; }
  }).filter((item) => item && ['stripunion.com', 'blog.stripunion.com'].includes(item.host));
  const hosts = new Set(production.map((item) => item.host));
  if (production.length === 1 && hosts.has('stripunion.com')) return 'MAIN STREAM';
  if (production.length === 1 && hosts.has('blog.stripunion.com')) return 'BLOG STREAM';
  if (production.length > 1) return 'UNKNOWN / MULTIPLE';
  return streams.length ? 'UNKNOWN / MULTIPLE' : 'UNKNOWN / MULTIPLE';
}

export function normalizeStreams(items = []) {
  return items.map((stream) => ({
    resourceName: stream.name || null,
    streamId: stream.name?.split('/').at(-1) || null,
    displayName: stream.displayName || null,
    defaultUri: stream.defaultUri || null,
    measurementId: stream.webStreamData?.measurementId || null,
    createTime: stream.createTime || null,
    updateTime: stream.updateTime || null
  }));
}

async function main() {
  const { google } = await import('googleapis');
  const { googleCredentials } = await import('../lib/google-auth.mjs');
  const auth = new google.auth.GoogleAuth({
    credentials: googleCredentials(),
    scopes: ['https://www.googleapis.com/auth/analytics.readonly']
  });
  const client = google.analyticsadmin({ version: 'v1beta', auth });
  const response = await client.properties.dataStreams.list({ parent: `properties/${propertyId}` });
  const streams = normalizeStreams((response.data.dataStreams || []).filter((stream) => stream.webStreamData))
    .filter((stream) => stream.resourceName && stream.measurementId);
  const topology = classifyStreams(streams);
  const stripUnionStreams = streams.filter((stream) => {
    try {
      return ['stripunion.com', 'blog.stripunion.com'].includes(new URL(stream.defaultUri).hostname.toLowerCase().replace(/^www\./, ''));
    } catch { return false; }
  });
  const snapshot = {
    source: 'google-analytics-admin',
    propertyId,
    collectedAt: new Date().toISOString(),
    topology,
    unifiedFunnelCandidate: stripUnionStreams.length === 1 ? stripUnionStreams[0].measurementId : null,
    streams
  };
  const destination = path.join(packageRoot, 'data', 'raw', isoDate(), 'ga4-admin.json');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  console.log(`GA4 Admin: discovered ${streams.length} WEB stream(s); topology ${topology}.`);
  for (const stream of streams) {
    console.log(`- ${stream.displayName || stream.streamId}: ${stream.defaultUri || '(no URI)'} · ${stream.measurementId}`);
  }
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `unified_measurement_id=${snapshot.unifiedFunnelCandidate || ''}\ntopology=${topology}\n`, 'utf8');
  }
  console.log(`Wrote ${path.relative(packageRoot, destination)}`);
}

if (process.argv.includes('--self-test')) {
  const streams = normalizeStreams([
    { name: 'properties/530171093/dataStreams/42', displayName: 'StripUnion', defaultUri: 'https://stripunion.com', webStreamData: { measurementId: 'G-TEST123456' } }
  ]);
  if (streams[0].measurementId !== 'G-TEST123456' || streams[0].streamId !== '42' || classifyStreams(streams) !== 'MAIN STREAM') {
    throw new Error('GA4 Admin collector self-test failed.');
  }
  if (classifyStreams(normalizeStreams([
    { name: 'properties/530171093/dataStreams/43', defaultUri: 'https://stripunion.com', webStreamData: { measurementId: 'G-MAIN123456' } },
    { name: 'properties/530171093/dataStreams/44', defaultUri: 'https://blog.stripunion.com', webStreamData: { measurementId: 'G-BLOG123456' } }
  ])) !== 'UNKNOWN / MULTIPLE') throw new Error('GA4 multi-stream classification failed.');
  console.log('GA4 Admin collector self-test passed.');
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Do not touch the existing snapshot on failure; never print credentials or request headers.
    console.error(`GA4 Admin collection failed: ${error.message}`);
    process.exitCode = 1;
  });
}

