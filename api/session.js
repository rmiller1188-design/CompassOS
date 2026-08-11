import { authenticateSupabaseRequest, safeAuthFailure } from '../src/security/supabase-request-auth.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const user = await authenticateSupabaseRequest({ headers: request.headers, env: process.env });
    response.setHeader('cache-control', 'no-store');
    return response.status(200).json({
      authenticated: true,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    const failure = safeAuthFailure(error);
    response.setHeader('cache-control', 'no-store');
    return response.status(failure.status).json(failure.body);
  }
}
