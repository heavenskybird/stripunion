import { githubApi, wakeDecision, journal } from './social-outbox-safety.mjs';
if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('Wakeup requires a fresh canonical run.');
// Pagination covers active runs even during a burst; truncated evidence fails closed.
const runs = [];
for (let page = 1; page <= 10; page++) {
  const data = await githubApi(`actions/workflows/social-outbox.yml/runs?branch=main&per_page=100&page=${page}`);
  if (!Array.isArray(data?.workflow_runs)) throw new Error('Missing outbox run evidence.');
  runs.push(...data.workflow_runs);
  if (data.workflow_runs.length < 100) break;
  if (page === 10) throw new Error('Truncated run inventory.');
}
const decision = wakeDecision(runs);
console.log('SOCIAL_OUTBOX_WAKEUP ' + JSON.stringify(decision));
if (decision.action === 'blocked') throw new Error('Outbox wakeup blocked; inspect evidence.');
if (decision.action === 'wake') {
  const store = await journal({ idempotency_key: 'native-social-outbox-wakeup' });
  if (store.state) {
    const age = Date.now() - Date.parse(store.state.attempted_at);
    if (!Number.isFinite(age) || age < 0) throw new Error('Invalid wake receipt; fail closed.');
    if (age < 30 * 60_000) { console.log('SOCIAL_OUTBOX_WAKE_COOLDOWN'); process.exit(0); }
  }
  await store.write({ version: 1, attempted_at: new Date().toISOString(), run_id: process.env.GITHUB_RUN_ID });
  // This job shares native-social-outbox concurrency with the sender. It never sends.
  await githubApi('actions/workflows/social-outbox.yml/dispatches', 'POST', { ref: 'main' });
}
