import { inspectRuntimeConfiguration } from './production-readiness.js';

const DEFAULT_PROVIDERS = Object.freeze(['google', 'microsoft', 'openai']);

export async function probeSupabase({ env, fetchImpl = fetch, timeoutMs = 5000 }) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    return Object.freeze({ configured: false, reachable: false });
  }

  try {
    const response = await fetchImpl(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/rest/v1/sync_runs?select=id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return Object.freeze({ configured: true, reachable: response.ok, status: response.status });
  } catch {
    return Object.freeze({ configured: true, reachable: false });
  }
}

export async function createRuntimeHealth({ env, fetchImpl = fetch, enabledProviders = DEFAULT_PROVIDERS, version }) {
  const inspected = inspectRuntimeConfiguration({ env, enabledProviders });
  const runtime = Object.freeze({
    ready: inspected.ready,
    missing: inspected.missing,
    unsafeExposure: inspected.unsafeExposure,
    malformed: inspected.malformed,
  });
  const supabase = await probeSupabase({ env, fetchImpl });
  const ready = runtime.ready && supabase.reachable;

  return Object.freeze({
    service: 'CompassOS',
    version: String(version || 'unknown'),
    deployment: 'vercel',
    ready,
    runtime,
    dependencies: Object.freeze({ supabase }),
  });
}
