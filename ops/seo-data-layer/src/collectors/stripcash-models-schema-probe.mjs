import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://go.whitetrafsa.com/app/models-ext/models';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readConfiguredUserId() {
  const envUserId = process.env.STRIPCASH_USER_ID?.trim();
  if (envUserId) return envUserId;

  const siteConfigPath = path.resolve(packageRoot, '../../src/config/site.js');
  const siteConfig = await fs.readFile(siteConfigPath, 'utf8');
  const match = siteConfig.match(/STRIPCASH_USER_ID\s*=\s*['"]([a-f0-9]{64})['"]/i);
  if (!match) throw new Error('Could not resolve STRIPCASH_USER_ID from environment or src/config/site.js.');
  return match[1];
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function objectShape(value, maxKeys = 100) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .slice(0, maxKeys)
      .map((key) => [key, typeOf(value[key])])
  );
}

function safeCatalog(payload) {
  const models = Array.isArray(payload?.models) ? payload.models : [];
  const first = models[0] || null;

  return {
    topLevelKeys: objectShape(payload),
    modelCountType: typeOf(payload?.count),
    totalType: typeOf(payload?.total),
    modelsLength: models.length,
    modelShape: objectShape(first),
    geobansShape: objectShape(first?.geobans),
    cdnHostShape: Array.isArray(payload?.CDNHosts) && payload.CDNHosts.length
      ? objectShape(payload.CDNHosts[0])
      : null
  };
}

async function selfTest() {
  const sample = {
    count: 1,
    total: 1,
    CDNHosts: [{ name: 'cdn', countries: {} }],
    CDNDefaultHost: 'cdn',
    models: [{
      id: 1,
      username: 'sample',
      status: 'public',
      snapshotUrl: 'https://example.invalid/a.jpg',
      clickUrl: 'https://example.invalid/room',
      tags: ['sample'],
      geobans: {
        blockedCountries: [],
        blockedRegions: {},
        blockedLanguages: []
      }
    }]
  };

  const catalog = safeCatalog(sample);
  if (catalog.modelShape?.username !== 'string') throw new Error('model schema self-test failed');
  if (catalog.geobansShape?.blockedCountries !== 'array') throw new Error('geobans schema self-test failed');
  console.log('StripCash models API probe self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await selfTest();
    return;
  }

  const token = process.env.STRIPCASH_MODELS_API_KEY?.trim();
  if (!token) throw new Error('STRIPCASH_MODELS_API_KEY is not configured.');

  const userId = await readConfiguredUserId();
  const url = new URL(API_URL);
  url.searchParams.set('userId', userId);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`StripCash Models API returned HTTP ${response.status}. Response body is intentionally not logged.`);
  }

  const payload = await response.json();

  console.log('StripCash Models API probe succeeded.');
  console.log('Only schema/key names, types, and model-array length are shown; no model identity, image URL, room URL, country, language, or tag values are printed.');
  console.log(JSON.stringify(safeCatalog(payload), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
