import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { documentDigest } from './editorial-novelty-receipt.mjs';
import { preflightReviewedEditorialBatch } from './editorial-guarded-generation.mjs';

// Offline command only: no GH transport, model, compiler or publisher is wired.
export async function reviewedPreflightCommand(args, read = file => fs.readFile(file, 'utf8')) {
  if (args[0] !== '--enable-offline-preflight') return { state: 'PAUSED_BY_DEFAULT', publicationAuthorized: false };
  if (args.length !== 3) throw new Error('Usage: --enable-offline-preflight INPUT.json TRUSTED-RECEIPT-DIGESTS.json');
  const input = JSON.parse(await read(args[1]));
  const trusted = JSON.parse(await read(args[2]));
  if (!Array.isArray(trusted) || !trusted.every(d => /^[a-f0-9]{64}$/.test(d))) throw new Error('TRUSTED_REVIEW_DIGESTS_INVALID');
  return preflightReviewedEditorialBatch({ ...input, enabled: true,
    // This explicit offline allowlist is a reviewer input, never authority
    // inferred from a model response. Production must use immutable provenance.
    verifyReviewProvenance: async receipt => trusted.includes(documentDigest(receipt)) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await reviewedPreflightCommand(process.argv.slice(2));
  console.log(JSON.stringify(result));
  if (!['PAUSED_BY_DEFAULT', 'READY_FOR_EXISTING_QUALITY_GATES'].includes(result.state)) process.exitCode = 1;
}
