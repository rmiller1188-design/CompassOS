import { createNormalizedContact } from "../domain/contact.js";
import { classifySyncError, SyncInvariantError } from "./mail-incremental.js";

export async function runIncrementalContactsSync({ account, adapter, store, maxPages = 100, now = () => new Date() }) {
  if (!account?.id || !account?.provider) throw new TypeError("Connected account is required");
  if (!adapter || !store) throw new TypeError("Adapter and store are required");
  const existing = await store.getCursor(account.id, "contacts");
  const mode = existing?.cursor ? "incremental" : "bootstrap";
  let requestCursor = existing?.cursor || null;
  let pages = 0;
  let written = 0;
  const seen = new Set();

  try {
    while (pages < maxPages) {
      const page = await adapter.fetchContactsPage({ account, cursor: requestCursor, mode });
      if (!page || !Array.isArray(page.items)) throw new SyncInvariantError("Provider page must include items");
      const key = page.requestCursor ?? requestCursor ?? "bootstrap";
      if (seen.has(key)) throw new SyncInvariantError(`Cursor cycle detected at ${key}`);
      seen.add(key);
      const normalized = page.items.map((item) => createNormalizedContact(adapter.normalizeContact(account, item)));
      if (normalized.length) {
        await store.upsertContacts(account.id, normalized);
        written += normalized.length;
      }
      pages += 1;
      if (!page.nextCursor) {
        const checkpoint = page.checkpoint || requestCursor;
        if (checkpoint) await store.saveCursor(account.id, "contacts", checkpoint, now().toISOString());
        await store.recordSync(account.id, { resource: "contacts", status: "succeeded", mode, pages, written });
        return { status: "succeeded", mode, pages, written, cursor: checkpoint || null };
      }
      requestCursor = page.nextCursor;
    }
    throw new SyncInvariantError(`Page limit ${maxPages} exceeded`);
  } catch (error) {
    const failure = error instanceof SyncInvariantError ? { retryable: false, reason: "sync_invariant" } : classifySyncError(error);
    await store.recordSync(account.id, { resource: "contacts", status: "failed", mode, pages, written, ...failure, message: String(error.message || error) });
    if (failure.reason === "reauthorization_required" && store.markReauthorizationRequired) await store.markReauthorizationRequired(account.id);
    throw error;
  }
}
