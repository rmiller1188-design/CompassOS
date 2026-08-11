function authError(code, status) {
  return Object.assign(new Error(code), { code, status });
}

export function extractBearerToken(headers = {}) {
  const raw = headers.authorization ?? headers.Authorization;
  if (Array.isArray(raw)) throw authError('invalid_authorization_header', 401);
  if (typeof raw !== 'string') throw authError('authentication_required', 401);
  const match = /^Bearer ([^\s]+)$/i.exec(raw.trim());
  if (!match) throw authError('invalid_authorization_header', 401);
  return match[1];
}

export async function authenticateSupabaseRequest({ headers, env, fetchImpl = fetch, timeoutMs = 5000 }) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_PUBLISHABLE_KEY) {
    throw authError('authentication_backend_not_configured', 503);
  }

  const accessToken = extractBearerToken(headers);
  let response;
  try {
    response = await fetchImpl(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw authError('authentication_backend_unavailable', 503);
  }

  if (!response.ok) throw authError('invalid_or_expired_session', 401);

  let user;
  try {
    user = await response.json();
  } catch {
    throw authError('authentication_backend_invalid_response', 503);
  }

  if (!user || typeof user.id !== 'string' || user.id.length < 1) {
    throw authError('authentication_backend_invalid_response', 503);
  }

  return Object.freeze({
    id: user.id,
    email: typeof user.email === 'string' ? user.email : null,
    role: typeof user.role === 'string' ? user.role : 'authenticated',
  });
}

export function safeAuthFailure(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'authentication_failed';
  return Object.freeze({ status, body: Object.freeze({ error: code }) });
}
