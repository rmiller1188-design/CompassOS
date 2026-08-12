import crypto from "node:crypto";

export type PkcePair = {
  verifier: string;
  challenge: string;
};

export function createPkcePair(): PkcePair {
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
