import fs from "node:fs";
import path from "node:path";

const directory = path.resolve(process.cwd(), "supabase", "migrations");
const expected = [
  "001_m26_tables.sql",
  "002_m26_functions.sql",
  "003_m26_rls_storage.sql",
  "004_m26_security_hardening.sql",
  "005_m26_atomic_workspace_operations.sql",
  "006_m26_sync_leases.sql"
];

const actual = fs.existsSync(directory)
  ? fs.readdirSync(directory).filter(name => name.endsWith(".sql")).sort()
  : [];

const missing = expected.filter(name => !actual.includes(name));
const unexpected = actual.filter(name => !expected.includes(name));
const empty = expected.filter(name => {
  const file = path.join(directory, name);
  return fs.existsSync(file) && fs.statSync(file).size === 0;
});

if (missing.length || unexpected.length || empty.length) {
  console.error("Compass M26 migration validation failed.");
  if (missing.length) console.error(`Missing: ${missing.join(", ")}`);
  if (unexpected.length) console.error(`Unexpected: ${unexpected.join(", ")}`);
  if (empty.length) console.error(`Empty: ${empty.join(", ")}`);
  process.exit(1);
}

console.log(`Compass M26 migration validation passed (${expected.length} ordered migrations).`);
