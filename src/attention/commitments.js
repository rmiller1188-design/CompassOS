const STATES = new Set(["proposed", "confirmed", "completed", "dismissed"]);
const TRANSITIONS = {
  proposed: new Set(["confirmed", "dismissed"]),
  confirmed: new Set(["completed", "dismissed"]),
  completed: new Set(),
  dismissed: new Set(),
};

function iso(value, field) {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid timestamp`);
  return date.toISOString();
}

export function createCommitment(input, { now = () => new Date(), idFactory = () => crypto.randomUUID() } = {}) {
  if (!input?.userId || !input?.text || !input?.sourceType || !input?.sourceId) throw new TypeError("Commitment user, text, and source are required");
  return {
    id: idFactory(),
    userId: input.userId,
    text: String(input.text).trim(),
    ownerEmail: input.ownerEmail ? String(input.ownerEmail).trim().toLowerCase() : null,
    dueAt: iso(input.dueAt, "dueAt"),
    sourceType: String(input.sourceType),
    sourceId: String(input.sourceId),
    sourceThreadKey: input.sourceThreadKey || null,
    status: "proposed",
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    confirmedAt: null,
    completedAt: null,
    dismissedAt: null,
    correction: null,
  };
}

export function transitionCommitment(commitment, nextStatus, { actorUserId, now = () => new Date(), correction = null } = {}) {
  if (!commitment || !STATES.has(commitment.status)) throw new TypeError("Valid commitment is required");
  if (actorUserId !== commitment.userId) throw new Error("Commitment ownership mismatch");
  if (!STATES.has(nextStatus) || !TRANSITIONS[commitment.status].has(nextStatus)) {
    throw new Error(`Invalid commitment transition ${commitment.status} -> ${nextStatus}`);
  }
  const at = now().toISOString();
  const updated = { ...commitment, status: nextStatus, updatedAt: at };
  if (nextStatus === "confirmed") updated.confirmedAt = at;
  if (nextStatus === "completed") updated.completedAt = at;
  if (nextStatus === "dismissed") updated.dismissedAt = at;
  if (correction != null) {
    const text = String(correction).trim();
    if (!text) throw new TypeError("Correction cannot be empty");
    updated.correction = { text, recordedAt: at, actorUserId };
  }
  return updated;
}

export function reviseCommitment(commitment, changes, { actorUserId, now = () => new Date() } = {}) {
  if (!commitment || actorUserId !== commitment.userId) throw new Error("Commitment ownership mismatch");
  if (commitment.status === "completed" || commitment.status === "dismissed") throw new Error("Terminal commitments cannot be revised");
  const updated = { ...commitment, updatedAt: now().toISOString() };
  if (Object.hasOwn(changes, "text")) {
    const text = String(changes.text || "").trim();
    if (!text) throw new TypeError("Commitment text cannot be empty");
    updated.text = text;
  }
  if (Object.hasOwn(changes, "ownerEmail")) updated.ownerEmail = changes.ownerEmail ? String(changes.ownerEmail).trim().toLowerCase() : null;
  if (Object.hasOwn(changes, "dueAt")) updated.dueAt = iso(changes.dueAt, "dueAt");
  return updated;
}

export function commitmentsFromMeetingPrep({ userId, meetingPrep, providerEventId, now, idFactory } = {}) {
  if (!meetingPrep || !Array.isArray(meetingPrep.commitments)) throw new TypeError("Meeting preparation commitments are required");
  return meetingPrep.commitments.map((item) => createCommitment({
    userId,
    text: item.text,
    ownerEmail: item.ownerEmail,
    dueAt: item.dueAt,
    sourceType: "meeting_preparation",
    sourceId: providerEventId,
    sourceThreadKey: item.sourceThreadKey,
  }, { now, idFactory }));
}

export { STATES as COMMITMENT_STATES };
