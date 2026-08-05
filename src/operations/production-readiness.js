import { createHash } from 'node:crypto';

const REQUIRED_SECRET_KEYS = Object.freeze([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TOKEN_ENVELOPE_KEY',
]);

const PROVIDER_REQUIREMENTS = Object.freeze({
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
  microsoft: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'],
  openai: ['OPENAI_API_KEY'],
});

const FORBIDDEN_PUBLIC_PREFIXES = Object.freeze([
  'NEXT_PUBLIC_',
  'VITE_',
  'PUBLIC_',
]);

function assertPlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function redactKeyName(key) {
  return createHash('sha256').update(String(key)).digest('hex').slice(0, 12);
}

export function inspectRuntimeConfiguration({ env, enabledProviders = [] }) {
  assertPlainObject(env, 'env');
  if (!Array.isArray(enabledProviders)) {
    throw new TypeError('enabledProviders must be an array');
  }

  const missing = [];
  const unsafeExposure = [];
  const malformed = [];

  for (const key of REQUIRED_SECRET_KEYS) {
    if (!env[key]) missing.push(key);
  }

  for (const provider of enabledProviders) {
    const required = PROVIDER_REQUIREMENTS[provider];
    if (!required) {
      malformed.push(`unsupported-provider:${provider}`);
      continue;
    }
    for (const key of required) {
      if (!env[key]) missing.push(key);
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    const upper = key.toUpperCase();
    const looksSensitive = /(SECRET|TOKEN|PRIVATE|SERVICE_ROLE|API_KEY|ENVELOPE_KEY)/.test(upper);
    const isPublic = FORBIDDEN_PUBLIC_PREFIXES.some((prefix) => upper.startsWith(prefix));
    if (looksSensitive && isPublic) unsafeExposure.push(key);
    if (typeof value !== 'string') malformed.push(`non-string:${key}`);
  }

  return Object.freeze({
    ready: missing.length === 0 && unsafeExposure.length === 0 && malformed.length === 0,
    missing: [...new Set(missing)].sort(),
    unsafeExposure: unsafeExposure.sort(),
    malformed: malformed.sort(),
    configuredKeyFingerprints: Object.keys(env)
      .filter((key) => Boolean(env[key]))
      .sort()
      .map(redactKeyName),
  });
}

export function inspectMigrationManifest(migrations) {
  if (!Array.isArray(migrations) || migrations.length === 0) {
    throw new TypeError('migrations must be a non-empty array');
  }

  const names = migrations.map((item) => {
    if (typeof item !== 'string' || !/^\d{8}_[a-z0-9_]+\.sql$/.test(item)) {
      throw new TypeError(`invalid migration name: ${String(item)}`);
    }
    return item;
  });

  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  const ordered = [...names].sort((a, b) => a.localeCompare(b));
  const outOfOrder = ordered.some((name, index) => name !== names[index]);

  return Object.freeze({
    ready: duplicates.length === 0 && !outOfOrder,
    count: names.length,
    duplicates: [...new Set(duplicates)].sort(),
    outOfOrder,
    first: ordered[0],
    last: ordered.at(-1),
    manifestHash: createHash('sha256').update(ordered.join('\n')).digest('hex'),
  });
}

export function evaluateProductionReadiness({ runtime, migrations, validations }) {
  assertPlainObject(runtime, 'runtime');
  assertPlainObject(migrations, 'migrations');
  if (!Array.isArray(validations)) throw new TypeError('validations must be an array');

  const normalizedValidations = validations.map((validation) => {
    assertPlainObject(validation, 'validation');
    if (!validation.id || !['passed', 'blocked', 'failed'].includes(validation.status)) {
      throw new TypeError('validation requires id and passed|blocked|failed status');
    }
    return Object.freeze({
      id: String(validation.id),
      status: validation.status,
      evidence: validation.evidence ? String(validation.evidence) : null,
    });
  });

  const failed = normalizedValidations.filter((item) => item.status === 'failed');
  const blocked = normalizedValidations.filter((item) => item.status === 'blocked');
  const ready = runtime.ready === true && migrations.ready === true && failed.length === 0 && blocked.length === 0;

  return Object.freeze({
    ready,
    disposition: ready ? 'reviewable-live' : failed.length > 0 ? 'failed' : 'infrastructure-blocked',
    failedValidationIds: failed.map((item) => item.id),
    blockedValidationIds: blocked.map((item) => item.id),
    runtime,
    migrations,
    validations: normalizedValidations,
  });
}
