export const OAUTH_PROVIDERS = Object.freeze({
  google: Object.freeze({
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
    userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    extraAuthorizationParams: Object.freeze({ access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent' }),
  }),
  microsoft: Object.freeze({
    authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    revokeEndpoint: null,
    userInfoEndpoint: 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
    extraAuthorizationParams: Object.freeze({ prompt: 'select_account' }),
  }),
});

export function getProviderConfig(provider) {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new TypeError(`Unsupported provider: ${provider}`);
  return config;
}
