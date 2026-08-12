import crypto from "node:crypto";

const tokenEncryptionKey = crypto.randomBytes(32).toString("base64");
const oauthStateSecret = crypto.randomBytes(48).toString("base64url");

console.log("# Add these values to Render and .env.local. Do not commit them.\n");
console.log(`TOKEN_ENCRYPTION_KEY=${tokenEncryptionKey}`);
console.log(`OAUTH_STATE_SECRET=${oauthStateSecret}`);
