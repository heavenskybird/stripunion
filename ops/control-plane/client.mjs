const tablePattern = /^[a-z_][a-z0-9_]*$/;

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function controlPlaneConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const required = boolEnv('CONTROL_PLANE_REQUIRED', false);

  return {
    url,
    serviceRoleKey,
    required,
    configured: Boolean(url && serviceRoleKey)
  };
}

function assertTable(table) {
  if (!tablePattern.test(table)) throw new Error('Invalid control-plane table name.');
}

async function request(config, table, rows, onConflict) {
  assertTable(table);
  if (!Array.isArray(rows) || !rows.length) return;

  const query = onConflict ? '?on_conflict=' + encodeURIComponent(onConflict) : '';
  const response = await fetch(config.url + '/rest/v1/' + table + query, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + config.serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 800);
    throw new Error('Control-plane upsert failed for ' + table + ': HTTP ' + response.status + ' ' + body);
  }
}

export async function upsertRows(config, table, rows, onConflict, chunkSize = 100) {
  if (!config?.configured) throw new Error('Control plane is not configured.');
  for (let index = 0; index < rows.length; index += chunkSize) {
    await request(config, table, rows.slice(index, index + chunkSize), onConflict);
  }
}
