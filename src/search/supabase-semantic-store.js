function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function assertClient(client) {
  if (!client?.rpc || !client?.from) throw new TypeError("Supabase client is required");
}

export function createSupabaseSemanticStore({ client, userId }) {
  assertClient(client);
  const owner = required(userId, "userId");
  return {
    async search({ userId: requestedUserId, embedding, limit = 10, minScore = 0, sourceTypes = [] }) {
      if (requestedUserId !== owner) throw new Error("Semantic store ownership mismatch");
      const { data, error } = await client.rpc("match_compass_documents_for_user", {
        p_user_id: owner,
        p_query_embedding: embedding,
        p_match_count: Math.max(1, Math.min(Number(limit) || 10, 50)),
        p_min_similarity: Number(minScore) || 0,
        p_source_types: sourceTypes,
      });
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        text: row.content,
        provenance: row.provenance || [],
        score: Number(row.similarity),
        indexedAt: row.indexed_at,
      }));
    },

    async recordRetrieval(event) {
      if (event.userId !== owner) throw new Error("Retrieval audit ownership mismatch");
      const { error } = await client.from("semantic_retrieval_audit").insert({
        user_id: owner,
        query_text: event.query,
        result_ids: event.resultIds,
        source_types: event.sourceTypes,
        occurred_at: event.occurredAt,
      });
      if (error) throw error;
    },
  };
}
