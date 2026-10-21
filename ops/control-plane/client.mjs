const tablePattern = /^[a-z_][a-z0-9_]*$/;

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function controlPlaneConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const required = boolEnv('CONTROL_PLANE_REQUIRED', false);

  return {
    url,
    secretKey,
    required,
    configured: Boolean(url && secretKey)
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
      apikey: config.secretKey,
      ...(config.secretKey.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + config.secretKey }),
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

export function uniqueUpsertRows(rows, onConflict) {
  if (!onConflict || !Array.isArray(rows)) return { rows, duplicates: 0 };
  const columns = onConflict.split(',').map((key) => key.trim());
  const seen = new Set();
  const unique = [];
  let duplicates = 0;
  for (const row of rows) {
    const identity = columns.map((key) => {
      if (row?.[key] == null || row[key] === '') throw new Error('Missing upsert conflict key: ' + key);
      return String(row[key]);
    });
    const signature = JSON.stringify(identity);
    if (seen.has(signature)) {
      duplicates++;
      continue; // Sorted input preserves highest-priority occurrence.
    }
    seen.add(signature);
    unique.push(row);
  }
  return { rows: unique, duplicates };
}

export async function upsertRows(config, table, rows, onConflict, chunkSize = 100) {
  if (!config?.configured) throw new Error('Control plane is not configured.');
  const prepared = uniqueUpsertRows(rows, onConflict);
  if (prepared.duplicates) {
    console.warn('CONTROL_PLANE_UPSERT_DUPLICATES ' + JSON.stringify({
      table, conflictKey: onConflict, skippedDuplicates: prepared.duplicates
    }));
  }
  for (let index = 0; index < prepared.rows.length; index += chunkSize) {
    await request(config, table, prepared.rows.slice(index, index + chunkSize), onConflict);
  }
}


export async function selectRows(config, table, query = '') {
  assertTable(table);
  if (!config?.configured) throw new Error('Control plane is not configured.');

  const suffix = query ? (query.startsWith('?') ? query : '?' + query) : '';
  const response = await fetch(config.url + '/rest/v1/' + table + suffix, {
    method: 'GET',
    headers: {
      apikey: config.secretKey,
      ...(config.secretKey.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + config.secretKey }),
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 800);
    throw new Error('Control-plane read failed for ' + table + ': HTTP ' + response.status + ' ' + body);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('Control-plane read returned a non-array payload for ' + table + '.');
  return payload;
}
