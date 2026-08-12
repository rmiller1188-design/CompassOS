import fs from "node:fs";
import path from "node:path";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fileValues = parseEnvFile(path.resolve(process.cwd(), ".env.local"));
const value = name => process.env[name] || fileValues[name] || "";
const failures = [];
const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "OAUTH_STATE_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET"
];

for (const name of required) {
  const current = value(name);
  if (!current) failures.push(`${name} is missing`);
  if (/example|replace-me|changeme/i.test(current)) failures.push(`${name} still contains a placeholder value`);
}

for (const name of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  const current = value(name);
  if (!current) continue;
  try {
    const url = new URL(current);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) failures.push(`${name} must use HTTPS outside local development`);
  } catch {
    failures.push(`${name} is not a valid URL`);
  }
}

const encryptionKey = value("TOKEN_ENCRYPTION_KEY");
if (encryptionKey) {
  try {
    if (Buffer.from(encryptionKey, "base64").length !== 32) {
      failures.push("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
    }
  } catch {
    failures.push("TOKEN_ENCRYPTION_KEY is not valid Base64");
  }
}

if (value("OAUTH_STATE_SECRET").length < 32) {
  failures.push("OAUTH_STATE_SECRET must be at least 32 characters");
}

const tenant = value("MICROSOFT_TENANT") || "common";
if (!/^(common|organizations|consumers|[0-9a-f-]{36})$/i.test(tenant)) {
  failures.push("MICROSOFT_TENANT must be common, organizations, consumers, or a tenant UUID");
}

if (failures.length) {
  console.error("Compass M26 environment validation failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Compass M26 environment validation passed.");
console.log(`App URL: ${value("NEXT_PUBLIC_APP_URL")}`);
console.log(`Supabase URL: ${value("NEXT_PUBLIC_SUPABASE_URL")}`);
console.log(`Microsoft tenant: ${tenant}`);
console.log(`OpenAI brief: ${value("OPENAI_API_KEY") ? "configured" : "optional key not configured"}`);
