const PROVIDERS = new Set(["google", "microsoft"]);

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError("Invalid contact email");
  return email;
}

function normalizePhone(value) {
  const phone = String(value || "").trim();
  return phone || null;
}

export function createNormalizedContact(input) {
  if (!PROVIDERS.has(input.provider)) throw new TypeError("Unsupported provider");
  if (!input.accountId || !input.providerContactId) throw new TypeError("Contact identifiers are required");
  const emails = [...new Set((input.emails || []).map(normalizeEmail).filter(Boolean))];
  const phones = [...new Set((input.phones || []).map(normalizePhone).filter(Boolean))];
  const displayName = String(input.displayName || "").trim();
  if (!displayName && !emails.length && !phones.length && !input.isDeleted) throw new TypeError("Contact must include a name, email, or phone");
  return {
    accountId: input.accountId,
    provider: input.provider,
    providerContactId: input.providerContactId,
    displayName,
    givenName: String(input.givenName || "").trim() || null,
    familyName: String(input.familyName || "").trim() || null,
    emails,
    phones,
    organization: String(input.organization || "").trim() || null,
    jobTitle: String(input.jobTitle || "").trim() || null,
    birthday: input.birthday || null,
    photoUrl: input.photoUrl || null,
    isDeleted: Boolean(input.isDeleted),
    updatedAt: new Date(input.updatedAt || Date.now()).toISOString(),
    rawRef: input.rawRef || null,
  };
}
