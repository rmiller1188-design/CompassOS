import test from "node:test";
import assert from "node:assert/strict";
import { createMemory, editMemory, deleteMemory, isMemoryRetrievable, createMemoryAudit } from "../src/memory/user-memory.js";
import { createSearchDocument, cosineSimilarity, rankSemanticResults, OpenAIEmbeddingClient, createSemanticSearchService } from "../src/search/semantic-search.js";
import { createSupabaseSemanticStore } from "../src/search/supabase-semantic-store.js";

const clock = (value) => () => new Date(value);

test("memory requires explicit ownership and supports edit, expiry, delete, and audit", () => {
  const created = createMemory({
    id: "mem-1",
    userId: "user-1",
    text: "Noah prefers concise Friday updates",
    sources: [{ sourceType: "message", sourceId: "msg-1" }],
    expiresAt: "2026-09-01T00:00:00.000Z",
  }, clock("2026-08-05T00:00:00.000Z"));
  assert.equal(created.status, "active");
  assert.equal(created.revision, 1);
  assert.equal(isMemoryRetrievable(created, clock("2026-08-06T00:00:00.000Z")), true);

  const edited = editMemory(created, { userId: "user-1", text: "Noah prefers concise Monday and Friday updates" }, clock("2026-08-06T00:00:00.000Z"));
  assert.equal(edited.revision, 2);
  assert.match(edited.text, /Monday/);
  assert.throws(() => editMemory(edited, { userId: "user-2", text: "wrong" }), /ownership/i);

  const audit = createMemoryAudit({ memory: edited, actorId: "user-1", eventType: "memory.edited" }, clock("2026-08-06T00:01:00.000Z"));
  assert.equal(audit.revision, 2);
  assert.equal(audit.memoryId, "mem-1");

  const deleted = deleteMemory(edited, { userId: "user-1" }, clock("2026-08-07T00:00:00.000Z"));
  assert.equal(deleted.status, "deleted");
  assert.equal(isMemoryRetrievable(deleted, clock("2026-08-08T00:00:00.000Z")), false);
  assert.equal(isMemoryRetrievable(created, clock("2026-10-01T00:00:00.000Z")), false);
});

test("semantic ranking excludes cross-tenant, expired, and deleted documents", () => {
  const base = { sourceType: "message", text: "project schedule update", provenance: [] };
  const documents = [
    createSearchDocument({ ...base, id: "a", userId: "user-1", sourceId: "m1", embedding: [1, 0], indexedAt: "2026-08-05T01:00:00Z" }),
    createSearchDocument({ ...base, id: "b", userId: "user-2", sourceId: "m2", embedding: [1, 0] }),
    createSearchDocument({ ...base, id: "c", userId: "user-1", sourceId: "m3", embedding: [0.9, 0.1], deletedAt: "2026-08-05T00:00:00Z" }),
    createSearchDocument({ ...base, id: "d", userId: "user-1", sourceId: "m4", embedding: [0.8, 0.2], expiresAt: "2026-08-04T00:00:00Z" }),
  ];
  const ranked = rankSemanticResults({ userId: "user-1", queryEmbedding: [1, 0], documents, now: clock("2026-08-05T02:00:00Z") });
  assert.deepEqual(ranked.map((item) => item.id), ["a"]);
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
});

test("OpenAI embedding adapter keeps credentials server-side and validates response count", async () => {
  let request;
  const client = new OpenAIEmbeddingClient({
    apiKey: "secret-key",
    dimensions: 3,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }] }) };
    },
  });
  const result = await client.embed(["hello"]);
  assert.deepEqual(result, [[0.1, 0.2, 0.3]]);
  assert.equal(request.url, "https://api.openai.com/v1/embeddings");
  assert.equal(request.options.headers.Authorization, "Bearer secret-key");
  assert.deepEqual(JSON.parse(request.options.body), { model: "text-embedding-3-small", input: ["hello"], encoding_format: "float", dimensions: 3 });
});

test("semantic service rejects cross-tenant store output and audits valid retrieval", async () => {
  const events = [];
  const service = createSemanticSearchService({
    embeddingClient: { embed: async () => [[1, 0]] },
    store: {
      search: async ({ userId }) => [{ id: "doc-1", userId, score: 0.9 }],
      recordRetrieval: async (event) => events.push(event),
    },
    now: clock("2026-08-05T03:00:00Z"),
  });
  const rows = await service.search({ userId: "user-1", query: "schedule", sourceTypes: ["message"] });
  assert.equal(rows.length, 1);
  assert.deepEqual(events[0].resultIds, ["doc-1"]);
  assert.equal(events[0].occurredAt, "2026-08-05T03:00:00.000Z");

  const unsafe = createSemanticSearchService({
    embeddingClient: { embed: async () => [[1, 0]] },
    store: { search: async () => [{ id: "foreign", userId: "user-2" }], recordRetrieval: async () => {} },
  });
  await assert.rejects(() => unsafe.search({ userId: "user-1", query: "x" }), /cross-tenant/i);
});

test("Supabase semantic store is bound to one user", async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [{ id: "d1", user_id: "user-1", source_type: "memory", source_id: "m1", content: "x", provenance: [], similarity: 0.8, indexed_at: "2026-08-05T00:00:00Z" }], error: null };
    },
    from: () => ({ insert: async (row) => { calls.push({ insert: row }); return { error: null }; } }),
  };
  const store = createSupabaseSemanticStore({ client, userId: "user-1" });
  const rows = await store.search({ userId: "user-1", embedding: [1, 0], limit: 5, sourceTypes: ["memory"] });
  assert.equal(rows[0].userId, "user-1");
  await store.recordRetrieval({ userId: "user-1", query: "x", resultIds: ["d1"], sourceTypes: ["memory"], occurredAt: "2026-08-05T00:00:00Z" });
  assert.equal(calls[0].name, "match_compass_documents_for_user");
  await assert.rejects(() => store.search({ userId: "user-2", embedding: [1, 0] }), /ownership/i);
});
