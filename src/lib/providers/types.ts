export type ProviderName = "google" | "microsoft";

export type ProviderTokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  idToken?: string | null;
};

export type ProviderIdentity = {
  externalAccountId: string;
  email: string;
  displayName?: string | null;
};
