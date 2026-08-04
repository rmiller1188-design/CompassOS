const SOURCE_TYPES = new Set(["message", "thread", "event", "contact", "commitment", "memory"]);

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function assertEmbedding(value, name = "embedding") {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !Number.isFinite(item))) {
    throw new TypeError(`${name} must be a non-empty numeric array`);
  }
  return value.map(Number);
}

export function createSearchDocument(input) {
  const sourceType = required(input?.sourceType, "sourceType");
  if (!SOURCE_TYPES.has(sourceType)) throw new TypeError(`Unsupported source type ${sourceType}`);
  return {
    id: required(input?.id, "id"),
    userId: required(input?.userId, "userId"),
    sourceType,
    sourceId: required(input?.sourceId, "sourceId"),
    text: required(input?.text, "text"),
    embedding: assertEmbedding(input?.embedding),
    provenance: Array.isArray(input?.provenance) ? input.provenance.map((item) => ({ ...item })) : [],
    expiresAt: input?.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    deletedAt: input?.deletedAt ? new Date(input.deletedAt).toISOString() : null,
    indexedAt: new Date(input?.indexedAt || Date.now()).toISOString(),
  };
}

export function cosineSimilarity(left, right) {
  const a = assertEmbedding(left, "left embedding");
  const b = assertEmbedding(right, "right embedding");
  if (a.length !== b.length) throw new TypeError("Embedding dimensions must match");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function rankSemanticResults({ userId, queryEmbedding, documents, limit = 10, minScore = 0, now = () => new Date() }) {
  const owner = required(userId, "userId");
  const query = assertEmbedding(queryEmbedding, "queryEmbedding");
  if (!Array.isArray(documents)) throw new TypeError("documents must be an array");
  const current = now().toISOString();
  return documents
    .filter((document) => document?.userId === owner)
    .filter((document) => !document.deletedAt)
    .filter((document) => !document.expiresAt || document.expiresAt > current)
    .map((document) => ({ ...document, score: cosineSimilarity(query, document.embedding) }))
    .filter((document) => document.score >= minScore)
    .sort((left, right) => right.score - left.score || String(right.indexedAt).localeCompare(String(left.indexedAt)))
    .slice(0, Math.max(1, Math.min(Number(limit) || 10, 50)));
}

export class OpenAIEmbeddingClient {
  constructor({ apiKey, model = "text-embedding-3-small", dimensions, fetchImpl = globalThis.fetch, baseUrl = "https://api.openai.com/v1" }) {
    this.apiKey = required(apiKey, "apiKey");
    this.model = required(model, "model");
    this.dimensions = dimensions;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async embed(inputs) {
    const values = (Array.isArray(inputs) ? inputs : [inputs]).map((value) => required(value, "embedding input"));
    const body = { model: this.model, input: values, encoding_format: "float" };
    if (this.dimensions) body.dimensions = this.dimensions;
    const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Embedding request failed with ${response.status}`);
      error.status = response.status;
      error.code = payload?.error?.code || null;
      throw error;
    }
    if (!Array.isArray(payload.data) || payload.data.length !== values.length) throw new Error("Embedding response count mismatch");
    return payload.data.sort((a, b) => a.index - b.index).map((item) => assertEmbedding(item.embedding));
  }
}

export function createSemanticSearchService({ embeddingClient, store, now = () => new Date() }) {
  if (!embeddingClient?.embed || !store?.search || !store?.recordRetrieval) throw new TypeError("Embedding client and search store are required");
  return {
    async search({ userId, query, limit = 10, minScore = 0, sourceTypes = [] }) {
      const owner = required(userId, "userId");
      const text = required(query, "query");
      const [embedding] = await embeddingClient.embed([text]);
      const rows = await store.search({ userId: owner, embedding, limit, minScore, sourceTypes });
      if (!Array.isArray(rows) || rows.some((row) => row.userId !== owner)) throw new Error("Search store returned cross-tenant results");
      const resultIds = rows.map((row) => row.id);
      await store.recordRetrieval({ userId: owner, query: text, resultIds, sourceTypes, occurredAt: now().toISOString() });
      return rows;
    },
  };
}
