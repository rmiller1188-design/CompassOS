const SELECT_FIELDS = 'id,provider,account_email,display_name,status,scopes,token_expires_at,last_sync_at';

function runtimeError(code, status = 503) {
  return Object.assign(new Error(code), { code, status });
}

function normalizeConnection(row) {
  if (!row || typeof row !== 'object') throw runtimeError('connections_backend_invalid_response');
  if (typeof row.id !== 'string' || !['google', 'microsoft'].includes(row.provider)) {
    throw runtimeError('connections_backend_invalid_response');
  }

  const scopes = Array.isArray(row.scopes)
    ? row.scopes.filter((value) => typeof value === 'string').slice(0, 32)
    : [];

  return Object.freeze({
    id: row.id,
    provider: row.provider,
    email: typeof row.account_email === 'string' ? row.account_email : null,
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    status: typeof row.status === 'string' ? row.status : 'error',
    scopes: Object.freeze(scopes),
    tokenExpiresAt: typeof row.token_expires_at === 'string' ? row.token_expires_at : null,
    lastSyncAt: typeof row.last_sync_at === 'string' ? row.last_sync_at : null,
  });
}

export async function listOwnedM26Connections({ accessToken, env, fetchImpl = fetch, timeoutMs = 5000 }) {
  if (typeof accessToken !== 'string' || accessToken.length < 1) {
    throw runtimeError('authentication_required', 401);
  }
  if (!env?.SUPABASE_URL || !env?.SUPABASE_PUBLISHABLE_KEY) {
    throw runtimeError('connections_backend_not_configured');
  }

  const base = String(env.SUPABASE_URL).replace(/\/$/, '');
  const url = `${base}/rest/v1/provider_connections?select=${encodeURIComponent(SELECT_FIELDS)}&order=created_at.asc`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw runtimeError('connections_backend_unavailable');
  }

  if (!response.ok) throw runtimeError('connections_backend_rejected', response.status === 401 ? 401 : 503);

  let rows;
  try {
    rows = await response.json();
  } catch {
    throw runtimeError('connections_backend_invalid_response');
  }
  if (!Array.isArray(rows)) throw runtimeError('connections_backend_invalid_response');

  return Object.freeze(rows.map(normalizeConnection));
}

export function safeConnectionsFailure(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'connections_failed';
  return Object.freeze({ status, body: Object.freeze({ error: code }) });
}
