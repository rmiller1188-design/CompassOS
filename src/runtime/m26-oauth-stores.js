import { createHash } from 'node:crypto';

function required(value, name) {
  if (!value || typeof value !== 'string') throw new TypeError(`${name} is required`);
  return value;
}

function createServiceClient({ supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const baseUrl = required(supabaseUrl, 'supabaseUrl').replace(/\/$/, '');
  const key = required(serviceRoleKey, 'serviceRoleKey');
  async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (!response.ok) {
      throw Object.assign(new Error('Supabase OAuth store request failed'), { status: response.status });
    }
    return payload;
  }
  return { request };
}

function normalizeConnection(row, tokenEnvelope) {
  if (!row?.id || !row?.owner_id || !row?.provider || !row?.external_account_id) {
    throw new TypeError('Malformed provider connection');
  }
  return {
    id: row.id,
    userId: row.owner_id,
    provider: row.provider,
    providerSubject: row.external_account_id,
    email: row.account_email,
    displayName: row.display_name || null,
    status: row.status,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    expiresAt: row.token_expires_at || null,
    tokenEnvelope,
  };
}

function envelopeParts(envelope) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') {
    throw new TypeError('Unsupported credential envelope');
  }
  return {
    encryptedPayload: required(envelope.ciphertext, 'ciphertext'),
    iv: required(envelope.iv, 'iv'),
    authTag: required(envelope.tag, 'tag'),
    keyVersion: envelope.version,
  };
}

function reconstructEnvelope(connection, credential) {
  if (!credential) throw new Error('Provider credential not found');
  return {
    version: Number(credential.key_version || 1),
    algorithm: 'aes-256-gcm',
    iv: credential.iv,
    tag: credential.auth_tag,
    ciphertext: credential.encrypted_payload,
    context: {
      purpose: 'provider-token',
      userId: connection.owner_id,
      provider: connection.provider,
      providerSubject: connection.external_account_id,
    },
  };
}

export function createM26OAuthStores({ supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const client = createServiceClient({ supabaseUrl, serviceRoleKey, fetchImpl });

  const stateStore = {
    async create(state) {
      await client.request('oauth_states', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: {
          nonce_hash: state.nonceHash,
          owner_id: state.userId,
          provider: state.provider,
          verifier_envelope: state.verifierEnvelope,
          redirect_uri: state.redirectUri,
          redirect_to: state.redirectTo || '/',
          expires_at: state.expiresAt,
          created_at: state.createdAt,
        },
      });
    },
    async consume(nonce) {
      if (!nonce) return null;
      const nonceHash = createHash('sha256').update(String(nonce)).digest('hex');
      const rows = await client.request('rpc/consume_oauth_state', {
        method: 'POST', body: { p_nonce_hash: nonceHash },
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      return {
        nonceHash: row.nonce_hash,
        userId: row.owner_id,
        provider: row.provider,
        verifierEnvelope: row.verifier_envelope,
        redirectUri: row.redirect_uri,
        redirectTo: row.redirect_to,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      };
    },
  };

  const auditStore = {
    async append(event) {
      const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
      await client.request('oauth_audit_events', {
        method: 'POST', headers: { prefer: 'return=minimal' },
        body: {
          owner_id: event.userId,
          provider: event.provider || null,
          connection_id: event.accountId || null,
          action: event.action,
          metadata,
        },
      });
    },
  };

  const accountStore = {
    async upsert(input) {
      const credential = envelopeParts(input.tokenEnvelope);
      const rows = await client.request('rpc/upsert_provider_connection_with_credential', {
        method: 'POST',
        body: {
          p_owner_id: input.userId,
          p_provider: input.provider,
          p_external_account_id: input.providerSubject,
          p_account_email: input.email,
          p_display_name: input.displayName || null,
          p_scopes: input.scopes || [],
          p_token_expires_at: input.expiresAt || null,
          p_encrypted_payload: credential.encryptedPayload,
          p_iv: credential.iv,
          p_auth_tag: credential.authTag,
          p_key_version: credential.keyVersion,
        },
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return normalizeConnection(row, input.tokenEnvelope);
    },
    async getOwned(userId, accountId) {
      const rows = await client.request(`provider_connections?id=eq.${encodeURIComponent(accountId)}&owner_id=eq.${encodeURIComponent(userId)}&select=*`);
      const connection = Array.isArray(rows) ? rows[0] : null;
      if (!connection) return null;
      const credentials = await client.request(`provider_credentials?connection_id=eq.${encodeURIComponent(accountId)}&select=*`);
      const credential = Array.isArray(credentials) ? credentials[0] : null;
      return normalizeConnection(connection, reconstructEnvelope(connection, credential));
    },
    async updateStatus(accountId, status) {
      const mapped = status === 'reauthorization_required' ? 'reauth_required' : status;
      await client.request(`provider_connections?id=eq.${encodeURIComponent(accountId)}`, {
        method: 'PATCH', headers: { prefer: 'return=minimal' }, body: { status: mapped, updated_at: new Date().toISOString() },
      });
    },
    async updateTokens(accountId, { tokenEnvelope, expiresAt, scopes, status }) {
      const credential = envelopeParts(tokenEnvelope);
      await client.request(`provider_credentials?connection_id=eq.${encodeURIComponent(accountId)}`, {
        method: 'PATCH', headers: { prefer: 'return=minimal' },
        body: { encrypted_payload: credential.encryptedPayload, iv: credential.iv, auth_tag: credential.authTag, key_version: credential.keyVersion, updated_at: new Date().toISOString() },
      });
      await client.request(`provider_connections?id=eq.${encodeURIComponent(accountId)}`, {
        method: 'PATCH', headers: { prefer: 'return=minimal' },
        body: { token_expires_at: expiresAt || null, scopes: scopes || [], status: status === 'connected' ? 'healthy' : status, last_error: null, updated_at: new Date().toISOString() },
      });
    },
    async disconnect(accountId) {
      await client.request(`provider_connections?id=eq.${encodeURIComponent(accountId)}`, {
        method: 'PATCH', headers: { prefer: 'return=minimal' }, body: { status: 'disconnected', updated_at: new Date().toISOString() },
      });
    },
  };

  return Object.freeze({ stateStore, auditStore, accountStore });
}

export function createProcessLockStore() {
  const active = new Map();
  return {
    async withLock(key, fn) {
      const prior = active.get(key) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const queued = prior.then(() => gate);
      active.set(key, queued);
      await prior;
      try { return await fn(); }
      finally {
        release();
        if (active.get(key) === queued) active.delete(key);
      }
    },
  };
}
