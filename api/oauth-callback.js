import { createOAuthLinkingService } from '../src/runtime/oauth-linking-service.js';

function safeRedirect(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/settings/accounts';
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  response.setHeader('cache-control', 'no-store');

  if (request.query?.error) {
    return response.status(400).json({ error: 'provider_authorization_denied' });
  }

  const nonce = typeof request.query?.state === 'string' ? request.query.state : '';
  const code = typeof request.query?.code === 'string' ? request.query.code : '';
  if (!nonce || !code) return response.status(400).json({ error: 'invalid_oauth_callback' });

  try {
    const service = createOAuthLinkingService({ env: process.env });
    const result = await service.completeAuthorization({ nonce, code });
    return response.redirect(303, safeRedirect(result.redirectTo));
  } catch {
    return response.status(400).json({ error: 'oauth_link_failed' });
  }
}
