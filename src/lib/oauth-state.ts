import crypto from "node:crypto";
import { env } from "@/lib/env";

export type OAuthState = {
  provider: "google" | "microsoft";
  profileId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
};

const encode = (value: Buffer | string) => Buffer.from(value).toString("base64url");

export function createOAuthState(input: Omit<OAuthState, "nonce" | "issuedAt">): string {
  const payload: OAuthState = {
    ...input,
    nonce: crypto.randomBytes(18).toString("base64url"),
    issuedAt: Date.now()
  };
  const body = encode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", env.oauthStateSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifyOAuthState(token: string): OAuthState {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("INVALID_OAUTH_STATE");
  const expected = crypto
    .createHmac("sha256", env.oauthStateSecret())
    .update(body)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error("INVALID_OAUTH_STATE");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
  if (Date.now() - payload.issuedAt > 10 * 60 * 1000) throw new Error("OAUTH_STATE_EXPIRED");
  return payload;
}
