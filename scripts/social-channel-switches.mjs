// Sending policy only. Buffer data collectors keep their separate read budget.
export function socialChannelSwitches(env = process.env) {
  const enabled = (value, name) => {
    const flag = String(value ?? 'false').toLowerCase();
    if (!['true', 'false'].includes(flag)) throw new Error(`Invalid ${name}; social sending refused.`);
    return flag === 'true';
  };
  const globalEnabled = enabled(env.SOCIAL_OUTBOX_SEND_ENABLED, 'global send switch');
  // Operator pause wins even over malformed unused channel configuration.
  if (!globalEnabled) return { globalEnabled: false, x: false, telegram: false };
  return { globalEnabled: true,
    x: enabled(env.SOCIAL_OUTBOX_X_SEND_ENABLED, 'X send switch'),
    telegram: enabled(env.SOCIAL_OUTBOX_TELEGRAM_SEND_ENABLED, 'Telegram send switch') };
}

export function assertNativeChannel(channel, env = process.env) {
  const switches = socialChannelSwitches(env);
  if (!switches.globalEnabled) throw new Error('Social sends disabled by operator.');
  if (!['x', 'telegram'].includes(channel) || !switches[channel]) throw new Error(`Social ${channel} sends disabled by channel switch.`);
  if (env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED !== 'true' ||
      env.GITHUB_WORKFLOW !== 'Native social outbox' || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_RUN_ATTEMPT !== '1' || env.GITHUB_REPOSITORY !== 'heavenskybird/stripunion') {
    throw new Error('Social sends require the accepted canonical Native single writer.');
  }
}
