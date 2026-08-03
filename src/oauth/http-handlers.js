function json(status, body, headers = {}) {
  return { status, headers: { 'content-type': 'application/json', ...headers }, body };
}

function requireAuthenticatedUser(context) {
  const userId = context?.user?.id;
  if (!userId) throw Object.assign(new Error('Authentication required'), { status: 401 });
  return userId;
}

function safeRedirectPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/settings/accounts';
  return value;
}

export function createOAuthHttpHandlers({ application, callbackBaseUrl }) {
  if (!application) throw new TypeError('application is required');
  if (!callbackBaseUrl) throw new TypeError('callbackBaseUrl is required');

  return {
    async start(request, context) {
      try {
        const userId = requireAuthenticatedUser(context);
        const provider = request.params?.provider;
        const redirectUri = new URL(`/api/oauth/${provider}/callback`, callbackBaseUrl).toString();
        const result = await application.startAuthorization({
          userId,
          provider,
          redirectUri,
          redirectTo: safeRedirectPath(request.query?.redirectTo),
          loginHint: request.query?.loginHint,
          features: {
            mail: request.query?.mail !== 'false',
            calendar: request.query?.calendar === 'true',
            contacts: request.query?.contacts === 'true',
          },
        });
        return json(200, result, { 'cache-control': 'no-store' });
      } catch (error) {
        return json(error.status || 400, { error: error.message });
      }
    },

    async callback(request) {
      try {
        if (request.query?.error) return json(400, { error: request.query.error, description: request.query.error_description || null });
        const result = await application.completeAuthorization({ nonce: request.query?.state, code: request.query?.code });
        return { status: 303, headers: { location: safeRedirectPath(result.redirectTo), 'cache-control': 'no-store' }, body: null };
      } catch (error) {
        return json(400, { error: error.message });
      }
    },

    async disconnect(request, context) {
      try {
        const userId = requireAuthenticatedUser(context);
        const result = await application.disconnect({ userId, accountId: request.params?.accountId });
        return json(200, result, { 'cache-control': 'no-store' });
      } catch (error) {
        return json(error.status || 400, { error: error.message });
      }
    },
  };
}
