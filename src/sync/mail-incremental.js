import { createNormalizedMessage } from "../domain/normalized.js";

export class SyncInvariantError extends Error {}

function assertPage(page) {
  if (!page || !Array.isArray(page.items)) throw new SyncInvariantError("Provider page must include items");
  if (page.nextCursor != null && typeof page.nextCursor !== "string") throw new SyncInvariantError("nextCursor must be a string or null");
}

export function classifySyncError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || "").toLowerCase();
  if (status === 401 || code === "invalid_grant") return { retryable: false, reason: "reauthorization_required" };
  if (status === 429) return { retryable: true, reason: "rate_limited", retryAfterMs: Number(error?.retryAfterMs || 60000) };
  if (status >= 500 || code === "etimedout" || code === "econnreset") return { retryable: true, reason: "provider_transient", retryAfterMs: Number(error?.retryAfterMs || 1000) };
  return { retryable: false, reason: "provider_rejected" };
}

export async function runIncrementalMailSync({ account, adapter, store, maxPages = 100, now = () => new Date() }) {
  if (!account?.id || !account?.provider) throw new TypeError("Connected account is required");
  if (!adapter || !store) throw new TypeError("Adapter and store are required");
  const existing = await store.getCursor(account.id, "mail");
  const mode = existing?.cursor ? "incremental" : "bootstrap";
  let cursor = existing?.cursor || null;
  let nextCursor = cursor;
  let pages = 0;
  let written = 0;
  const seen = new Set();

  try {
    while (pages < maxPages) {
      const page = await adapter.fetchMailPage({ account, cursor: nextCursor, mode });
      assertPage(page);
      const pageKey = page.requestCursor ?? nextCursor ?? "bootstrap";
      if (seen.has(pageKey)) throw new SyncInvariantError(`Cursor cycle detected at ${pageKey}`);
      seen.add(pageKey);

      const normalized = page.items.map((item) => createNormalizedMessage(adapter.normalizeMessage(account, item)));
      if (normalized.length) {
        await store.upsertMessages(account.id, normalized);
        written += normalized.length;
      }

      pages += 1;
      if (!page.nextCursor) {
        const checkpoint = page.checkpoint || nextCursor || cursor;
        if (checkpoint) await store.saveCursor(account.id, "mail", checkpoint, now().toISOString());
        await store.recordSync(account.id, { resource: "mail", status: "succeeded", mode, pages, written });
        return { status: "succeeded", mode, pages, written, cursor: checkpoint || null };
      }
      nextCursor = page.nextCursor;
    }
    throw new SyncInvariantError(`Page limit ${maxPages} exceeded`);
  } catch (error) {
    const failure = error instanceof SyncInvariantError
      ? { retryable: false, reason: "sync_invariant" }
      : classifySyncError(error);
    await store.recordSync(account.id, { resource: "mail", status: "failed", mode, pages, written, ...failure, message: String(error.message || error) });
    if (failure.reason === "reauthorization_required" && store.markReauthorizationRequired) {
      await store.markReauthorizationRequired(account.id);
    }
    throw error;
  }
}
