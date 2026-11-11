// Provider error bodies are untrusted and may contain request data. Emit only
// fixed operational codes, never the body, provider message, or credential.
export async function editorialResponse(response) {
  if (response.ok) return response.json();
  let payload;
  try { payload = await response.json(); } catch { /* non-JSON errors are common */ }
  const code = payload?.error?.code;
  const type = payload?.error?.type;
  const category = ['credit_balance_exhausted', 'insufficient_quota'].includes(code) || type === 'insufficient_quota'
    ? 'PROVIDER_QUOTA_EXHAUSTED'
    : response.status === 429 ? 'PROVIDER_RATE_LIMITED'
    : response.status === 401 ? 'PROVIDER_AUTHENTICATION_FAILED'
    : response.status === 403 ? 'PROVIDER_ACCESS_DENIED'
    : 'PROVIDER_REQUEST_FAILED';
  throw new Error(`EDITORIAL_PROVIDER ${category} http=${response.status}; generation stopped; inspect provider account before a new admitted cycle`);
}
