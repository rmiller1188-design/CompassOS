# CompassOS P4C Review — User-Controlled Memory and Semantic Search

## Review scope

P4C introduces explicit user-owned memory and tenant-isolated semantic retrieval. It does not automatically convert model output, messages, meetings, or contacts into durable memory. A memory record must be created, edited, expired, or deleted through an owner-controlled lifecycle.

## Implemented guarantees

- Memory records are bound to one user and carry an incrementing revision.
- Memory creation requires explicit content and may include source provenance.
- Only active memory can be edited.
- Expired or deleted memory is excluded from retrieval.
- Cross-user memory edits and semantic searches are rejected.
- Semantic documents retain source type, source ID, content, provenance, expiry, deletion, and indexing timestamps.
- Server-side embeddings use the OpenAI embeddings endpoint through an injectable adapter.
- Search results are rejected if the persistence boundary returns another tenant's records.
- Every successful retrieval writes an audit record containing the query, result IDs, source filters, user, and timestamp.
- The Supabase match function is executable only by the service role and is paired with a user-bound application adapter.
- Browser roles receive owner-read access but no semantic indexing or retrieval-audit write policy.

## Database boundary

The migration adds `memory_items`, `semantic_documents`, and `semantic_retrieval_audit`, enables pgvector, creates an HNSW cosine index, and supplies a service-role-only match function. The default storage dimension is 1536 for `text-embedding-3-small`; the application adapter also supports configurable embedding dimensions for future migrations.

## Validation

`npm run validate` syntax-checks the complete production core and runs the Node test suite. P4C tests cover ownership, revision, expiry, deletion, audit generation, cosine ranking, tenant filtering, OpenAI request construction, cross-tenant result rejection, Supabase RPC mapping, and user-bound store enforcement.

This milestone is reviewable only after GitHub Actions succeeds on the final branch head.

## Security posture

- OpenAI credentials remain server-side.
- Provider OAuth tokens never enter the semantic search contract.
- No automatic memory retention is introduced.
- No outbound mail, messaging, contact, or calendar mutation is introduced.
- No unsupported iMessage database access is introduced.

## Explicit blockers

- No live OpenAI embedding request has been executed because no production API key is configured in the repository.
- The pgvector migration has not been applied to a live Supabase project.
- No production corpus, relevance benchmark, latency benchmark, or embedding-cost evaluation has been run.
- Re-embedding/version migration and production background indexing remain later operational milestones.
