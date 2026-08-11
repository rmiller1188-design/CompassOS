import { createRuntimeHealth } from '../src/operations/runtime-health.js';

const VERSION = '0.51.0';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  const health = await createRuntimeHealth({ env: process.env, version: VERSION });
  response.setHeader('cache-control', 'no-store');
  return response.status(health.ready ? 200 : 503).json(health);
}
