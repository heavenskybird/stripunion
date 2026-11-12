import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function outboxAdmission(value, { repository, ref } = {}) {
  const flag = String(value || 'false').toLowerCase();
  if (!['true', 'false'].includes(flag)) throw new Error('Invalid social send switch; refusing admission.');
  if (flag === 'false') return { state: 'PAUSED_BY_OPERATOR', sendEnabled: false };
  if (repository !== 'heavenskybird/stripunion' || ref !== 'refs/heads/main') throw new Error('Only canonical main may admit social sending.');
  return { state: 'ENABLED', sendEnabled: true };
}
async function main() {
  const decision = outboxAdmission(process.env.SOCIAL_OUTBOX_SEND_ENABLED, {
    repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF
  });
  console.log('SOCIAL_OUTBOX_STATE ' + JSON.stringify(decision));
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT,
    `state=${decision.state}\nsend_enabled=${decision.sendEnabled}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    decision.sendEnabled ? 'Native Outbox: ENABLED; provider checks and delivery gates still apply.\n'
      : '## PAUSED_BY_OPERATOR\n\nNo install, sync, reconciliation, provider request, sending or state persistence was attempted. Historical unknown sends are unchanged. This is an intentional pause, not delivery success. SEO source degradation is reported independently.\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
