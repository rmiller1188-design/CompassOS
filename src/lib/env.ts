const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const env = {
  appUrl: () => required("NEXT_PUBLIC_APP_URL").replace(/\/$/, ""),
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  tokenEncryptionKey: () => required("TOKEN_ENCRYPTION_KEY"),
  oauthStateSecret: () => required("OAUTH_STATE_SECRET"),
  googleClientId: () => required("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => required("GOOGLE_CLIENT_SECRET"),
  microsoftClientId: () => required("MICROSOFT_CLIENT_ID"),
  microsoftClientSecret: () => required("MICROSOFT_CLIENT_SECRET"),
  microsoftTenant: () => process.env.MICROSOFT_TENANT || "common",
  openAiApiKey: () => required("OPENAI_API_KEY"),
  openAiModel: () => process.env.OPENAI_MODEL || "gpt-5"
};
