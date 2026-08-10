function assertResult(result, operation) {
  if (result?.error) {
    const error = new Error(`${operation}: ${result.error.message || "Supabase operation failed"}`);
    error.code = result.error.code;
    error.status = result.status;
    throw error;
  }
  return result?.data;
}

function createSyncControlError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.retryable = true;
  error.retryAfterMs = 5_000;
  return error;
}

function resourceName(provider, resource) {
  if (resource === "mail") return provider === "google" ? "gmail_history" : "graph_mail_delta";
  if (resource === "calendar") return provider === "google" ? "google_calendar_sync" : "graph_calendar_delta";
  return resource;
}

function assertLeaseContext(lease, account) {
  if (!lease?.accountId || !lease?.provider || !lease?.workerId || !lease?.leaseToken) {
    throw createSyncControlError("SYNC_CURSOR_FENCE_INVALID", "Complete account sync lease is required for fenced cursor persistence");
  }
  if (lease.accountId !== account.id || lease.provider !== account.provider) {
    throw createSyncControlError("SYNC_CURSOR_FENCE_INVALID", "Account sync lease does not match cursor scope");
  }
  return lease;
}

function assertFencedCursorResult(result) {
  if (result?.error) {
    throw createSyncControlError("SYNC_CURSOR_FENCE_BACKEND", "Lease-fenced cursor persistence failed");
  }
  const data = result?.data;
  const value = Array.isArray(data) ? data[0] : data;
  const saved = value === true || value?.saved === true;
  if (!saved) {
    throw createSyncControlError("SYNC_CURSOR_FENCE_LOST", "Account sync lease no longer authorizes cursor advancement");
  }
  return true;
}

function messageRow(userId, account, message) {
  if (message.accountId !== account.id || message.provider !== account.provider) {
    throw new TypeError("Normalized message does not belong to the bound account");
  }
  return {
    user_id: userId,
    account_id: account.id,
    provider: account.provider,
    provider_message_id: message.providerMessageId,
    thread_key: message.threadKey,
    internet_message_id: message.internetMessageId,
    subject: message.subject,
    snippet: message.snippet,
    sender_email: message.from,
    to_emails: message.to,
    cc_emails: message.cc,
    sent_at: message.sentAt,
    received_at: message.receivedAt,
    is_read: message.isRead,
    has_attachments: message.hasAttachments,
    raw_ref: message.rawRef,
    updated_at: new Date().toISOString(),
  };
}

function aggregateThreads(userId, account, messages) {
  const threads = new Map();
  for (const message of messages) {
    const current = threads.get(message.threadKey) || {
      user_id: userId,
      account_id: account.id,
      provider: account.provider,
      thread_key: message.threadKey,
      subject: message.subject,
      participant_emails: [],
      latest_message_at: message.receivedAt,
      unread_count: 0,
      message_count: 0,
      updated_at: new Date().toISOString(),
    };
    current.subject ||= message.subject;
    current.latest_message_at = new Date(current.latest_message_at) > new Date(message.receivedAt)
      ? current.latest_message_at : message.receivedAt;
    current.unread_count += message.isRead ? 0 : 1;
    current.message_count += 1;
    current.participant_emails = [...new Set([
      ...current.participant_emails,
      message.from,
      ...message.to,
      ...message.cc,
    ].filter(Boolean))];
    threads.set(message.threadKey, current);
  }
  return [...threads.values()];
}

export function createSupabaseMailSyncStore({ client, userId, account, now = () => new Date() }) {
  if (!client?.from) throw new TypeError("Supabase client is required");
  if (!userId || !account?.id || !["google", "microsoft"].includes(account.provider)) {
    throw new TypeError("Bound user and connected account are required");
  }

  function assertAccount(accountId) {
    if (accountId !== account.id) throw new TypeError("Account scope violation");
  }

  return {
    async getCursor(accountId, resource) {
      assertAccount(accountId);
      const result = await client.from("sync_cursors")
        .select("cursor,watermark")
        .eq("account_id", account.id)
        .eq("resource", resourceName(account.provider, resource))
        .maybeSingle();
      return assertResult(result, "get cursor") || null;
    },

    async saveCursor(accountId, resource, cursor, watermark, lease = null) {
      assertAccount(accountId);
      if (lease != null) {
        assertLeaseContext(lease, account);
        if (typeof client.rpc !== "function") {
          throw createSyncControlError("SYNC_CURSOR_FENCE_BACKEND", "Lease-fenced cursor persistence is unavailable");
        }
        const result = await client.rpc("save_sync_cursor_with_account_lease", {
          p_account_id: account.id,
          p_provider: account.provider,
          p_worker_id: lease.workerId,
          p_lease_token: lease.leaseToken,
          p_resource: resourceName(account.provider, resource),
          p_cursor: cursor,
          p_watermark: watermark,
        });
        assertFencedCursorResult(result);
        return;
      }

      const result = await client.from("sync_cursors").upsert({
        account_id: account.id,
        resource: resourceName(account.provider, resource),
        cursor,
        watermark,
        failure_count: 0,
        last_error_code: null,
        updated_at: now().toISOString(),
      }, { onConflict: "account_id,resource" });
      assertResult(result, "save cursor");
    },

    async upsertMessages(accountId, messages) {
      assertAccount(accountId);
      if (!messages.length) return;
      const rows = messages.map((message) => messageRow(userId, account, message));
      assertResult(await client.from("messages").upsert(rows, {
        onConflict: "account_id,provider_message_id",
        ignoreDuplicates: false,
      }), "upsert messages");
      const threads = aggregateThreads(userId, account, messages);
      assertResult(await client.from("message_threads").upsert(threads, {
        onConflict: "account_id,thread_key",
        ignoreDuplicates: false,
      }), "upsert threads");
    },

    async recordSync(accountId, run) {
      assertAccount(accountId);
      assertResult(await client.from("sync_runs").insert({
        user_id: userId,
        account_id: account.id,
        resource: resourceName(account.provider, run.resource),
        status: run.status,
        mode: run.mode,
        pages: run.pages,
        written: run.written,
        retryable: run.retryable ?? null,
        reason: run.reason ?? null,
        message: run.message ?? null,
        finished_at: now().toISOString(),
      }), "record sync run");

      if (run.status === "failed" && run.retryable) {
        const delay = Math.max(1000, Number(run.retryAfterMs || 1000));
        assertResult(await client.from("sync_retry_jobs").insert({
          user_id: userId,
          account_id: account.id,
          resource: resourceName(account.provider, run.resource),
          reason: run.reason || "provider_transient",
          available_at: new Date(now().getTime() + delay).toISOString(),
          last_error: run.message ?? null,
        }), "queue retry");
      }
    },

    async markReauthorizationRequired(accountId) {
      assertAccount(accountId);
      const result = await client.from("connected_accounts")
        .update({ status: "reauth_required", updated_at: now().toISOString() })
        .eq("id", account.id)
        .eq("user_id", userId);
      assertResult(result, "mark reauthorization required");
    },
  };
}
