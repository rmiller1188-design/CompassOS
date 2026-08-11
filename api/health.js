import { inspectRuntimeConfiguration } from '../src/operations/production-readiness.js';

const VERSION = '0.51.0';
const ENABLED_PROVIDERS = ['google', 'microsoft', 'openai'];

function safeRuntimeSnapshot(env) {
  const inspected = inspectRuntimeConfiguration({ env, enabledProviders: ENABLED_PROVIDERS });
  return {
    ready: inspected.ready,
    missing: inspected.missing,
    unsafeExposure: inspected.unsafeExposure,
    malformed: inspected.malformed,
  };
}

async function probeSupabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { configured: false, reachable: false };
  }

  try {
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/sync_runs?select=id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    return { configured: true, reachable: response.ok, status: response.status };
  } catch {
    return { configured: true, reachable: false };
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  const runtime = safeRuntimeSnapshot(process.env);
  const supabase = await probeSupabase(process.env);
  const ready = runtime.ready && supabase.reachable;

  response.setHeader('cache-control', 'no-store');
  return response.status(ready ? 200 : 503).json({
    service: 'CompassOS',
    version: VERSION,
    deployment: 'vercel',
    ready,
    runtime,
    dependencies: { supabase },
  });
}
