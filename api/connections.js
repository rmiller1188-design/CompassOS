import { authenticateSupabaseRequest, extractBearerToken, safeAuthFailure } from '../src/security/supabase-request-auth.js';
import { listOwnedM26Connections, safeConnectionsFailure } from '../src/runtime/m26-connections.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  response.setHeader('cache-control', 'no-store');

  let accessToken;
  try {
    accessToken = extractBearerToken(request.headers);
    await authenticateSupabaseRequest({ headers: request.headers, env: process.env });
  } catch (error) {
    const failure = safeAuthFailure(error);
    return response.status(failure.status).json(failure.body);
  }

  try {
    const connections = await listOwnedM26Connections({ accessToken, env: process.env });
    return response.status(200).json({ connections });
  } catch (error) {
    const failure = safeConnectionsFailure(error);
    return response.status(failure.status).json(failure.body);
  }
}
