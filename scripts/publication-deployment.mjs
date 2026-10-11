import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function guideFingerprints(files) {
  const entries = [];
  for (const file of files) {
    if (!/^src\/data\/guides\/[a-z0-9-]+\.js$/.test(file)) throw new Error('Invalid guide fingerprint path.');
    entries.push([path.basename(file, '.js'), createHash('sha256').update(await fs.readFile(file)).digest('hex')]);
  }
  return Object.fromEntries(entries);
}

export default function publicationDeployment() {
  return { name: 'publication-deployment-evidence', hooks: {
    'astro:build:done': async ({ dir }) => {
      const files = (await fs.readdir('src/data/guides')).filter((file) => file.endsWith('.js')).sort();
      const guides = await guideFingerprints(files.map((file) => `src/data/guides/${file}`));
      await fs.writeFile(path.join(fileURLToPath(dir), 'publication-deployment.json'),
        JSON.stringify({ version: 1, guides }) + '\n');
    },
  } };
}
