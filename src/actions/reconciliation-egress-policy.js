const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;

const PROVIDER_ROUTES = Object.freeze({
  google: Object.freeze({
    mail: Object.freeze({
      origin: 'https://gmail.googleapis.com',
      path: /^\/gmail\/v1\/users\/me\/messages$/,
    }),
    calendar: Object.freeze({
      origin: 'https://www.googleapis.com',
      path: /^\/calendar\/v3\/calendars\/[^/]+\/events(?:\/[^/]+)?$/,
    }),
  }),
  microsoft: Object.freeze({
    mail: Object.freeze({
      origin: 'https://graph.microsoft.com',
      path: /^\/v1\.0\/me\/mailFolders\/sentitems\/messages$/,
    }),
    calendar: Object.freeze({
      origin: 'https://graph.microsoft.com',
      path: /^\/v1\.0\/me\/events(?:\/[^/]+)?$/,
    }),
  }),
});

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function policyError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  if (Number.isInteger(status)) error.status = status;
  return error;
}

function routeFor(provider, kind) {
  const route = PROVIDER_ROUTES[provider]?.[kind];
  if (!route) throw policyError('PROVIDER_EGRESS_ROUTE_UNSUPPORTED', `Unsupported reconciliation egress route: ${provider}/${kind}`);
  return route;
}

function assertSafeUrl(url, route) {
  let parsed;
  try {
    parsed = new URL(requireString(String(url), 'Provider request URL'));
  } catch {
    throw policyError('PROVIDER_EGRESS_URL_INVALID', 'Provider request URL is invalid');
  }

  if (parsed.protocol !== 'https:' || parsed.origin !== route.origin) {
    throw policyError('PROVIDER_EGRESS_ORIGIN_BLOCKED', `Provider reconciliation origin is not allowed: ${parsed.origin}`);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw policyError('PROVIDER_EGRESS_URL_BLOCKED', 'Provider reconciliation URL may not contain credentials or a fragment');
  }
  if (!route.path.test(parsed.pathname)) {
    throw policyError('PROVIDER_EGRESS_PATH_BLOCKED', `Provider reconciliation path is not allowed: ${parsed.pathname}`);
  }
  return parsed;
}

function assertSafeRequest(init = {}) {
  const method = String(init?.method || 'GET').toUpperCase();
  if (method !== 'GET') throw policyError('PROVIDER_EGRESS_METHOD_BLOCKED', `Reconciliation provider method is not allowed: ${method}`);
  if (init?.body != null) throw policyError('PROVIDER_EGRESS_BODY_BLOCKED', 'Reconciliation provider requests may not include a body');

  const normalizedHeaders = new Headers(init?.headers || {});
  const authorization = normalizedHeaders.get('authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    throw policyError('PROVIDER_EGRESS_AUTH_REQUIRED', 'Reconciliation provider request requires a bearer credential');
  }

  const headers = Object.fromEntries(normalizedHeaders.entries());
  return {
    ...init,
    method: 'GET',
    redirect: 'error',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers,
  };
}

function assertResponseMetadata(response, route) {
  if (!response || typeof response !== 'object') {
    throw policyError('PROVIDER_RESPONSE_INVALID', 'Provider reconciliation response is invalid');
  }
  if (response.redirected === true || response.type === 'opaqueredirect') {
    throw policyError('PROVIDER_RESPONSE_REDIRECT_BLOCKED', 'Redirected provider reconciliation responses are not allowed', response.status);
  }

  const finalUrl = typeof response.url === 'string' ? response.url.trim() : '';
  if (finalUrl) assertSafeUrl(finalUrl, route);

  const contentType = response.headers?.get?.('content-type');
  if (contentType && !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType.trim())) {
    throw policyError('PROVIDER_RESPONSE_CONTENT_TYPE_BLOCKED', `Provider reconciliation response content type is not JSON: ${contentType}`, response.status);
  }

  const declaredLength = response.headers?.get?.('content-length');
  if (declaredLength != null && declaredLength !== '') {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw policyError('PROVIDER_RESPONSE_LENGTH_INVALID', 'Provider reconciliation response content length is invalid', response.status);
    }
    if (bytes > MAX_PROVIDER_RESPONSE_BYTES) {
      throw policyError('PROVIDER_RESPONSE_TOO_LARGE', `Provider reconciliation response exceeds ${MAX_PROVIDER_RESPONSE_BYTES} bytes`, response.status);
    }
  }
}

async function readStreamBytes(response) {
  const reader = response?.body?.getReader?.();
  if (!reader) return null;

  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      total += chunk.byteLength;
      if (total > MAX_PROVIDER_RESPONSE_BYTES) {
        try { await reader.cancel?.(); } catch {}
        throw policyError('PROVIDER_RESPONSE_TOO_LARGE', `Provider reconciliation response exceeds ${MAX_PROVIDER_RESPONSE_BYTES} bytes`, response.status);
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock?.(); } catch {}
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBoundedJson(response) {
  const streamed = await readStreamBytes(response);
  if (streamed) {
    if (streamed.byteLength === 0) return {};
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(streamed);
      return JSON.parse(text);
    } catch {
      throw policyError('PROVIDER_RESPONSE_INVALID_JSON', 'Provider reconciliation response is not valid UTF-8 JSON', response.status);
    }
  }

  if (typeof response.json !== 'function') {
    throw policyError('PROVIDER_RESPONSE_INVALID', 'Provider reconciliation response cannot be decoded as JSON', response.status);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw policyError('PROVIDER_RESPONSE_INVALID_JSON', 'Provider reconciliation response is not valid JSON', response.status);
  }

  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw policyError('PROVIDER_RESPONSE_INVALID_JSON', 'Provider reconciliation response JSON cannot be serialized', response.status);
  }
  if (Buffer.byteLength(serialized || '', 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) {
    throw policyError('PROVIDER_RESPONSE_TOO_LARGE', `Provider reconciliation response exceeds ${MAX_PROVIDER_RESPONSE_BYTES} bytes`, response.status);
  }
  return payload;
}

async function guardResponse(response, route) {
  assertResponseMetadata(response, route);
  const payload = await readBoundedJson(response);
  return new Proxy(response, {
    get(target, property) {
      if (property === 'json') return async () => payload;
      if (property === 'body' || property === 'bodyUsed') return property === 'body' ? null : true;
      return Reflect.get(target, property, target);
    },
  });
}

export function createReconciliationEgressFetch({ provider, kind, fetchImpl = globalThis.fetch } = {}) {
  const normalizedProvider = requireString(provider, 'Provider').toLowerCase();
  const normalizedKind = requireString(kind, 'Provider route kind').toLowerCase();
  if (typeof fetchImpl !== 'function') throw new TypeError('Provider fetch implementation is required');
  const route = routeFor(normalizedProvider, normalizedKind);

  return async function guardedProviderFetch(url, init = {}) {
    const parsed = assertSafeUrl(url, route);
    const safeInit = assertSafeRequest(init);
    const response = await fetchImpl(parsed.toString(), safeInit);
    return guardResponse(response, route);
  };
}

export function getReconciliationEgressPolicy() {
  return Object.freeze({
    maxProviderResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
    google: Object.freeze({
      mailOrigin: PROVIDER_ROUTES.google.mail.origin,
      calendarOrigin: PROVIDER_ROUTES.google.calendar.origin,
    }),
    microsoft: Object.freeze({
      mailOrigin: PROVIDER_ROUTES.microsoft.mail.origin,
      calendarOrigin: PROVIDER_ROUTES.microsoft.calendar.origin,
    }),
  });
}
