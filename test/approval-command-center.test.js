import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalDecisionRequest,
  buildApprovalAccessibilityModel,
  buildApprovalInbox,
  nextApprovalSelection,
  normalizeApprovalItem,
  renderApprovalCommandCenter,
} from '../src/ui/approval-command-center.js';

const base = {
  id: 'action-1', userId: 'user-1', providerAccountId: 'acct-1', provider: 'google',
  accountLabel: 'Work Gmail', actionType: 'gmail_reply', status: 'pending_approval',
  payloadHash: 'hash-1', payloadRevision: 2, createdAt: '2026-08-05T12:00:00.000Z',
  summary: 'Reply to project update', recipientSummary: 'noah@example.com',
  diff: [{ field: 'body', before: 'Old', after: 'New' }], warnings: [],
};

test('normalizes a pending approval and rejects executable states', () => {
  assert.equal(normalizeApprovalItem(base).actionLabel, 'Send Gmail reply');
  assert.throws(() => normalizeApprovalItem({ ...base, status: 'approved' }), /pending_approval/);
});

test('filters cross-tenant actions and orders oldest first', () => {
  const inbox = buildApprovalInbox([
    { ...base, id: 'later', createdAt: '2026-08-05T13:00:00.000Z' },
    { ...base, id: 'other', userId: 'user-2' },
    { ...base, id: 'earlier', createdAt: '2026-08-05T11:00:00.000Z' },
  ], { userId: 'user-1', viewport: 'desktop' });
  assert.deepEqual(inbox.items.map(({ id }) => id), ['earlier', 'later']);
  assert.equal(inbox.layout, 'split');
});

test('phone uses a stacked workflow', () => {
  const inbox = buildApprovalInbox([base], { userId: 'user-1', viewport: 'phone' });
  assert.equal(inbox.layout, 'stack');
});

test('decision request binds approval to payload hash and revision', () => {
  const request = approvalDecisionRequest({ item: base, decision: 'approve', actorUserId: 'user-1' });
  assert.equal(request.expectedPayloadHash, 'hash-1');
  assert.equal(request.expectedPayloadRevision, 2);
  assert.equal(request.expectedStatus, 'pending_approval');
});

test('cross-user decisions fail closed', () => {
  assert.throws(() => approvalDecisionRequest({ item: base, decision: 'approve', actorUserId: 'user-2' }), /owning user/);
});

test('destructive approvals require typed confirmation', () => {
  const item = { ...base, actionType: 'microsoft_calendar_update', destructive: true };
  assert.throws(() => approvalDecisionRequest({ item, decision: 'approve', actorUserId: 'user-1' }), /typed APPROVE/);
  assert.equal(approvalDecisionRequest({ item, decision: 'approve', actorUserId: 'user-1', typedConfirmation: 'APPROVE' }).confirmation, 'typed');
});

test('keyboard navigation wraps deterministically', () => {
  const inbox = buildApprovalInbox([{ ...base, id: 'a' }, { ...base, id: 'b' }], { userId: 'user-1' });
  assert.equal(nextApprovalSelection(inbox, 'b', 'next'), 'a');
  assert.equal(nextApprovalSelection(inbox, 'a', 'previous'), 'b');
});

test('accessibility model exposes region, list semantics, and live status', () => {
  const inbox = buildApprovalInbox([base], { userId: 'user-1' });
  const model = buildApprovalAccessibilityModel(inbox);
  assert.match(model.regionLabel, /1 pending action/);
  assert.equal(model.listRole, 'listbox');
  assert.equal(model.keyboardShortcuts.ArrowDown, 'Select next action');
});

test('renderer escapes untrusted content and includes review controls', () => {
  const inbox = buildApprovalInbox([{ ...base, summary: '<script>alert(1)</script>' }], { userId: 'user-1' });
  const html = renderApprovalCommandCenter(inbox);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-decision="approve"/);
  assert.match(html, /Payload changes requiring approval/);
});
