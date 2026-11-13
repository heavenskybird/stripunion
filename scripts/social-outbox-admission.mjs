import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { socialChannelSwitches } from './social-channel-switches.mjs';

export function outboxAdmission(value, { repository, ref, xSendEnabled, telegramSendEnabled, singleWriterEnabled } = {}) {
  const flag = String(value || 'false').toLowerCase();
  if (!['true', 'false'].includes(flag)) throw new Error('Invalid social send switch; refusing admission.');
  if (flag === 'false') return { state: 'PAUSED_BY_OPERATOR', sendEnabled: false };
  if (repository !== 'heavenskybird/stripunion' || ref !== 'refs/heads/main') throw new Error('Only canonical main may admit social sending.');
  const channels = socialChannelSwitches({ SOCIAL_OUTBOX_SEND_ENABLED: value,
    SOCIAL_OUTBOX_X_SEND_ENABLED: xSendEnabled, SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED: telegramSendEnabled });
  const sendEnabled = channels.x || channels.telegram;
  if (sendEnabled && singleWriterEnabled !== 'true') throw new Error('Single-writer cutover has not been accepted.');
  return { state: sendEnabled ? 'ENABLED' : 'PAUSED_NO_CHANNELS', sendEnabled,
    xSendEnabled: channels.x, telegramSendEnabled: channels.telegram };
}
async function main() {
  const decision = outboxAdmission(process.env.SOCIAL_OUTBOX_SEND_ENABLED, {
    repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF,
    xSendEnabled: process.env.SOCIAL_OUTBOX_X_SEND_ENABLED,
    telegramSendEnabled: process.env.SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED,
    singleWriterEnabled: process.env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED
  });
  console.log('SOCIAL_OUTBOX_STATE ' + JSON.stringify(decision));
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT,
    `state=${decision.state}\nsend_enabled=${decision.sendEnabled}\nx_send_enabled=${decision.xSendEnabled || false}\ntelegram_send_enabled=${decision.telegramSendEnabled || false}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    decision.sendEnabled ? `Native Outbox: ENABLED (X=${decision.xSendEnabled}, Telegram=${decision.telegramSendEnabled}); provider and single-writer gates still apply.\n`
      : `## ${decision.state}\n\nNo install, sync, reconciliation, provider request, sending or state persistence was attempted. Historical unknown sends are unchanged. This is an intentional pause, not delivery success. SEO source degradation is reported independently.\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
