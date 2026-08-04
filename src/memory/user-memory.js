const MEMORY_STATUS = new Set(["active", "deleted"]);

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function isoDate(value, name) {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a valid date`);
  return date.toISOString();
}

function normalizeSources(sources = []) {
  if (!Array.isArray(sources)) throw new TypeError("sources must be an array");
  const seen = new Set();
  return sources.map((source) => {
    const sourceType = required(source?.sourceType, "sourceType");
    const sourceId = required(source?.sourceId, "sourceId");
    const key = `${sourceType}:${sourceId}`;
    if (seen.has(key)) throw new TypeError(`Duplicate memory source ${key}`);
    seen.add(key);
    return { sourceType, sourceId };
  });
}

function assertOwner(memory, userId) {
  if (!memory || memory.userId !== userId) throw new Error("Memory ownership mismatch");
}

export function createMemory(input, now = () => new Date()) {
  const createdAt = now().toISOString();
  const memory = {
    id: required(input?.id, "id"),
    userId: required(input?.userId, "userId"),
    text: required(input?.text, "text"),
    sources: normalizeSources(input?.sources),
    status: "active",
    revision: 1,
    expiresAt: isoDate(input?.expiresAt, "expiresAt"),
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  if (memory.expiresAt && memory.expiresAt <= createdAt) throw new TypeError("expiresAt must be in the future");
  return memory;
}

export function editMemory(memory, { userId, text, sources, expiresAt }, now = () => new Date()) {
  assertOwner(memory, userId);
  if (!MEMORY_STATUS.has(memory.status) || memory.status !== "active") throw new Error("Only active memory can be edited");
  const updatedAt = now().toISOString();
  const next = {
    ...memory,
    text: text === undefined ? memory.text : required(text, "text"),
    sources: sources === undefined ? memory.sources : normalizeSources(sources),
    expiresAt: expiresAt === undefined ? memory.expiresAt : isoDate(expiresAt, "expiresAt"),
    revision: memory.revision + 1,
    updatedAt,
  };
  if (next.expiresAt && next.expiresAt <= updatedAt) throw new TypeError("expiresAt must be in the future");
  return next;
}

export function deleteMemory(memory, { userId }, now = () => new Date()) {
  assertOwner(memory, userId);
  if (memory.status === "deleted") return memory;
  const deletedAt = now().toISOString();
  return { ...memory, status: "deleted", revision: memory.revision + 1, deletedAt, updatedAt: deletedAt };
}

export function isMemoryRetrievable(memory, now = () => new Date()) {
  if (!memory || memory.status !== "active" || memory.deletedAt) return false;
  return !memory.expiresAt || memory.expiresAt > now().toISOString();
}

export function createMemoryAudit({ memory, actorId, eventType, metadata = {}, now = () => new Date() }) {
  if (!MEMORY_STATUS.has(memory?.status)) throw new TypeError("Valid memory is required");
  return {
    userId: memory.userId,
    memoryId: memory.id,
    actorId: required(actorId, "actorId"),
    eventType: required(eventType, "eventType"),
    revision: memory.revision,
    metadata: { ...metadata },
    occurredAt: now().toISOString(),
  };
}
