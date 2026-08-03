const PROVIDERS = new Set(["google", "microsoft"]);

export function normalizeEmailAddress(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError("Invalid email address");
  return email;
}

export function createNormalizedMessage(input) {
  if (!PROVIDERS.has(input.provider)) throw new TypeError("Unsupported provider");
  if (!input.accountId || !input.providerMessageId || !input.threadKey) throw new TypeError("Message identifiers are required");
  return {
    accountId: input.accountId,
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    threadKey: input.threadKey,
    internetMessageId: input.internetMessageId || null,
    subject: input.subject || "",
    snippet: input.snippet || "",
    from: input.from ? normalizeEmailAddress(input.from) : null,
    to: (input.to || []).map(normalizeEmailAddress),
    cc: (input.cc || []).map(normalizeEmailAddress),
    sentAt: new Date(input.sentAt).toISOString(),
    receivedAt: new Date(input.receivedAt || input.sentAt).toISOString(),
    isRead: Boolean(input.isRead),
    hasAttachments: Boolean(input.hasAttachments),
    rawRef: input.rawRef || null,
  };
}

export function createNormalizedEvent(input) {
  if (!PROVIDERS.has(input.provider)) throw new TypeError("Unsupported provider");
  if (!input.accountId || !input.providerEventId || !input.startsAt || !input.endsAt) throw new TypeError("Event identifiers and times are required");
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!(startsAt < endsAt)) throw new TypeError("Event end must be after start");
  return {
    accountId: input.accountId,
    provider: input.provider,
    providerEventId: input.providerEventId,
    title: input.title || "Untitled event",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: input.timezone || "UTC",
    organizer: input.organizer ? normalizeEmailAddress(input.organizer) : null,
    attendees: (input.attendees || []).map(normalizeEmailAddress),
    location: input.location || null,
    isCancelled: Boolean(input.isCancelled),
    rawRef: input.rawRef || null,
  };
}
