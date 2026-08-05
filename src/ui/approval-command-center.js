const ACTION_LABELS = Object.freeze({
  gmail_reply: "Send Gmail reply",
  microsoft_reply: "Send Microsoft reply",
  google_calendar_create: "Create Google Calendar event",
  google_calendar_update: "Update Google Calendar event",
  google_calendar_respond: "Respond to Google invitation",
  microsoft_calendar_create: "Create Microsoft calendar event",
  microsoft_calendar_update: "Update Microsoft calendar event",
  microsoft_calendar_respond: "Respond to Microsoft invitation",
});

const DESTRUCTIVE_TYPES = new Set([
  "google_calendar_update",
  "microsoft_calendar_update",
  "google_calendar_respond",
  "microsoft_calendar_respond",
]);

export function normalizeApprovalItem(item) {
  if (!item?.id || !item?.userId || !item?.providerAccountId || !item?.actionType) {
    throw new TypeError("Approval items require id, owner, provider account, and action type");
  }
  if (item.status !== "pending_approval") {
    throw new Error("Approval inbox accepts pending_approval actions only");
  }
  if (!item.payloadHash || !Number.isInteger(item.payloadRevision) || item.payloadRevision < 1) {
    throw new TypeError("Approval items require a payload hash and positive payload revision");
  }

  return Object.freeze({
    id: String(item.id),
    userId: String(item.userId),
    providerAccountId: String(item.providerAccountId),
    provider: String(item.provider || "unknown"),
    accountLabel: String(item.accountLabel || "Connected account"),
    actionType: String(item.actionType),
    actionLabel: ACTION_LABELS[item.actionType] || "Review outbound action",
    status: "pending_approval",
    payloadHash: String(item.payloadHash),
    payloadRevision: item.payloadRevision,
    createdAt: String(item.createdAt),
    summary: String(item.summary || "Review required"),
    recipientSummary: String(item.recipientSummary || ""),
    diff: Array.isArray(item.diff) ? item.diff.map(normalizeDiffRow) : [],
    warnings: Array.isArray(item.warnings) ? item.warnings.map(String) : [],
    destructive: Boolean(item.destructive || DESTRUCTIVE_TYPES.has(item.actionType)),
  });
}

function normalizeDiffRow(row) {
  if (!row?.field) throw new TypeError("Diff rows require a field");
  return Object.freeze({
    field: String(row.field),
    before: row.before == null ? null : String(row.before),
    after: row.after == null ? null : String(row.after),
    changed: row.before !== row.after,
    sensitive: Boolean(row.sensitive),
  });
}

export function buildApprovalInbox(items, { userId, selectedId = null, viewport = "desktop" } = {}) {
  if (!userId) throw new TypeError("Approval inbox requires an authenticated user id");
  if (!['phone', 'desktop'].includes(viewport)) throw new TypeError("Viewport must be phone or desktop");

  const normalized = items.map(normalizeApprovalItem).filter((item) => item.userId === userId);
  normalized.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const selected = normalized.find((item) => item.id === selectedId) || normalized[0] || null;

  return Object.freeze({
    viewport,
    count: normalized.length,
    empty: normalized.length === 0,
    items: normalized,
    selectedId: selected?.id || null,
    selected,
    layout: viewport === "phone" ? "stack" : "split",
  });
}

export function approvalDecisionRequest({ item, decision, actorUserId, typedConfirmation = "" }) {
  const normalized = normalizeApprovalItem(item);
  if (actorUserId !== normalized.userId) throw new Error("Only the owning user may decide this action");
  if (!['approve', 'reject', 'cancel'].includes(decision)) throw new TypeError("Unsupported approval decision");

  if (decision === "approve" && normalized.destructive && typedConfirmation.trim().toUpperCase() !== "APPROVE") {
    throw new Error("Destructive actions require typed APPROVE confirmation");
  }

  return Object.freeze({
    actionId: normalized.id,
    actorUserId,
    decision,
    expectedStatus: "pending_approval",
    expectedPayloadHash: normalized.payloadHash,
    expectedPayloadRevision: normalized.payloadRevision,
    confirmation: normalized.destructive ? "typed" : "explicit_click",
  });
}

export function nextApprovalSelection(inbox, currentId, direction) {
  if (!inbox?.items) throw new TypeError("Inbox view model is required");
  if (!['next', 'previous'].includes(direction)) throw new TypeError("Direction must be next or previous");
  if (inbox.items.length === 0) return null;
  const currentIndex = Math.max(0, inbox.items.findIndex((item) => item.id === currentId));
  const delta = direction === "next" ? 1 : -1;
  return inbox.items[(currentIndex + delta + inbox.items.length) % inbox.items.length].id;
}

export function buildApprovalAccessibilityModel(inbox) {
  if (!inbox) throw new TypeError("Inbox view model is required");
  return Object.freeze({
    regionLabel: `Approval inbox, ${inbox.count} pending ${inbox.count === 1 ? 'action' : 'actions'}`,
    listRole: "listbox",
    detailRole: "region",
    keyboardShortcuts: Object.freeze({
      ArrowDown: "Select next action",
      ArrowUp: "Select previous action",
      Enter: "Open selected action",
      Escape: "Return focus to action list",
    }),
    liveMessage: inbox.empty ? "No actions are waiting for approval" : `${inbox.count} actions waiting for approval`,
  });
}

export function renderApprovalCommandCenter(inbox) {
  const a11y = buildApprovalAccessibilityModel(inbox);
  const list = inbox.items.map((item) => `
    <button class="approval-row" role="option" aria-selected="${item.id === inbox.selectedId}" data-action-id="${escapeHtml(item.id)}">
      <span class="approval-row__title">${escapeHtml(item.actionLabel)}</span>
      <span class="approval-row__summary">${escapeHtml(item.summary)}</span>
      <span class="approval-row__account">${escapeHtml(item.accountLabel)}</span>
    </button>`).join("");

  const detail = inbox.selected ? renderDetail(inbox.selected) : '<section class="approval-empty" role="status">No actions are waiting for approval.</section>';
  return `<main class="approval-shell approval-shell--${inbox.layout}" aria-label="${escapeHtml(a11y.regionLabel)}">
    <aside class="approval-list" role="${a11y.listRole}" tabindex="0" aria-label="Pending actions">${list}</aside>
    ${detail}
    <p class="sr-only" aria-live="polite">${escapeHtml(a11y.liveMessage)}</p>
  </main>`;
}

function renderDetail(item) {
  const diffs = item.diff.map((row) => `<tr>
    <th scope="row">${escapeHtml(row.field)}</th>
    <td>${row.before == null ? '<span aria-label="Empty">—</span>' : escapeHtml(row.before)}</td>
    <td>${row.after == null ? '<span aria-label="Empty">—</span>' : escapeHtml(row.after)}</td>
  </tr>`).join("");
  const warnings = item.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  return `<section class="approval-detail" role="region" aria-label="Review ${escapeHtml(item.actionLabel)}">
    <header><p>${escapeHtml(item.accountLabel)}</p><h1>${escapeHtml(item.actionLabel)}</h1><p>${escapeHtml(item.summary)}</p></header>
    ${warnings ? `<div class="approval-warning" role="alert"><strong>Review warning</strong><ul>${warnings}</ul></div>` : ''}
    <div class="approval-diff-wrap"><table class="approval-diff"><caption>Payload changes requiring approval</caption><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>${diffs}</tbody></table></div>
    ${item.destructive ? '<label class="approval-confirm">Type <strong>APPROVE</strong> before approving<input name="typedConfirmation" autocomplete="off" spellcheck="false"></label>' : ''}
    <footer class="approval-actions"><button data-decision="reject">Reject</button><button data-decision="approve">Approve</button></footer>
  </section>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}
