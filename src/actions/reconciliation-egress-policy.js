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

function policyError(code, message) {
  const error = new Error(message);
  error.code = code;
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

  const headers = new Headers(init?.headers || {});
  const authorization = headers.get('authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    throw policyError('PROVIDER_EGRESS_AUTH_REQUIRED', 'Reconciliation provider request requires a bearer credential');
  }

  return {
    ...init,
    method: 'GET',
    redirect: 'error',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers,
  };
}

export function createReconciliationEgressFetch({ provider, kind, fetchImpl = globalThis.fetch } = {}) {
  const normalizedProvider = requireString(provider, 'Provider').toLowerCase();
  const normalizedKind = requireString(kind, 'Provider route kind').toLowerCase();
  if (typeof fetchImpl !== 'function') throw new TypeError('Provider fetch implementation is required');
  const route = routeFor(normalizedProvider, normalizedKind);

  return async function guardedProviderFetch(url, init = {}) {
    const parsed = assertSafeUrl(url, route);
    const safeInit = assertSafeRequest(init);
    return fetchImpl(parsed.toString(), safeInit);
  };
}

export function getReconciliationEgressPolicy() {
  return Object.freeze({
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
