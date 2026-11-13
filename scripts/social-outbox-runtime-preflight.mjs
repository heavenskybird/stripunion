import { socialChannelSwitches, assertNativeChannel } from './social-channel-switches.mjs';
import { githubApi, RUNTIME_BRANCH } from './social-outbox-safety.mjs';
import { pathToFileURL } from 'node:url';

export async function runtimePreflight({ env = process.env, api = githubApi } = {}) {
  const channels = socialChannelSwitches(env);
  if (!channels.globalEnabled || (!channels.x && !channels.telegram)) return { state: 'PAUSED', requests: 0 };
  assertNativeChannel(channels.telegram ? 'telegram' : 'x', env);
  const branch = await api(`branches/${encodeURIComponent(RUNTIME_BRANCH)}`);
  if (!branch || branch.name !== RUNTIME_BRANCH || !/^[a-f0-9]{40}$/.test(branch.commit?.sha || '')) {
    throw new Error('Accepted isolated social runtime is missing or unreadable; no sync or provider work allowed.');
  }
  return { state: 'RUNTIME_BRANCH_VERIFIED', branchSha: branch.commit.sha, requests: 1 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('SOCIAL_RUNTIME_PREFLIGHT ' + JSON.stringify(await runtimePreflight()));
}
