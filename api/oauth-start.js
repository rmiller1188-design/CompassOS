import { authenticateSupabaseRequest, safeAuthFailure } from '../src/security/supabase-request-auth.js';
import { createOAuthLinkingService, getProviderRedirectUri } from '../src/runtime/oauth-linking-service.js';

const SUPPORTED = new Set(['google', 'microsoft']);

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  let user;
  try {
    user = await authenticateSupabaseRequest({ headers: request.headers, env: process.env });
  } catch (error) {
    const failure = safeAuthFailure(error);
    response.setHeader('cache-control', 'no-store');
    return response.status(failure.status).json(failure.body);
  }

  try {
    const provider = String(request.query?.provider || '').toLowerCase();
    if (!SUPPORTED.has(provider)) return response.status(400).json({ error: 'unsupported_provider' });

    const service = createOAuthLinkingService({ env: process.env });
    const result = await service.startAuthorization({
      userId: user.id,
      provider,
      redirectUri: getProviderRedirectUri(provider, process.env),
      redirectTo: typeof request.query?.redirectTo === 'string' ? request.query.redirectTo : '/settings/accounts',
      loginHint: typeof request.query?.loginHint === 'string' ? request.query.loginHint : user.email || undefined,
      features: { mail: true, calendar: true, contacts: true },
    });

    response.setHeader('cache-control', 'no-store');
    return response.status(200).json({
      provider,
      authorizationUrl: result.authorizationUrl,
      expiresAt: result.expiresAt,
    });
  } catch {
    response.setHeader('cache-control', 'no-store');
    return response.status(503).json({ error: 'oauth_linking_unavailable' });
  }
}
