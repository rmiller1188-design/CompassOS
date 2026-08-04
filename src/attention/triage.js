const PRIORITIES = new Set(["critical", "high", "normal", "low"]);
const ACTIONS = new Set(["respond", "review", "schedule", "delegate", "wait", "archive"]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hoursBetween(a, b) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function buildAttentionCandidate(message, { now = new Date(), userEmails = [] } = {}) {
  if (!message?.accountId || !message?.providerMessageId || !message?.receivedAt) {
    throw new TypeError("Normalized message identifiers and receivedAt are required");
  }
  const recipients = [...(message.to || []), ...(message.cc || [])].map((email) => email.toLowerCase());
  const directToUser = userEmails.some((email) => recipients.includes(String(email).toLowerCase()));
  const ageHours = hoursBetween(message.receivedAt, now);
  const subject = normalizeText(message.subject);
  const snippet = normalizeText(message.snippet);
  const text = `${subject} ${snippet}`.toLowerCase();
  const indicators = {
    directToUser,
    unread: !message.isRead,
    recent: ageHours <= 24,
    stale: ageHours >= 72,
    deadlineLanguage: /\b(today|tomorrow|deadline|due|eod|asap|urgent|immediately)\b/.test(text),
    questionLanguage: /\?|\b(can you|could you|would you|please confirm|need you to)\b/.test(text),
    meetingLanguage: /\b(meeting|calendar|schedule|availability|invite)\b/.test(text),
  };
  let deterministicScore = 20;
  if (indicators.directToUser) deterministicScore += 18;
  if (indicators.unread) deterministicScore += 12;
  if (indicators.recent) deterministicScore += 8;
  if (indicators.deadlineLanguage) deterministicScore += 22;
  if (indicators.questionLanguage) deterministicScore += 14;
  if (indicators.meetingLanguage) deterministicScore += 8;
  if (indicators.stale) deterministicScore -= 12;

  return {
    id: `${message.accountId}:${message.providerMessageId}`,
    accountId: message.accountId,
    provider: message.provider,
    providerMessageId: message.providerMessageId,
    threadKey: message.threadKey,
    subject,
    snippet,
    from: message.from,
    receivedAt: new Date(message.receivedAt).toISOString(),
    indicators,
    deterministicScore: clamp(deterministicScore, 0, 100),
  };
}

export function selectAttentionCandidates(messages, options = {}) {
  const limit = options.limit ?? 40;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new RangeError("limit must be between 1 and 200");
  return messages
    .map((message) => buildAttentionCandidate(message, options))
    .sort((a, b) => b.deterministicScore - a.deterministicScore || b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, limit);
}

export function validateTriageResult(result, candidateIds) {
  if (!result || !Array.isArray(result.items) || typeof result.summary !== "string") {
    throw new TypeError("Triage result must include summary and items");
  }
  const allowedIds = new Set(candidateIds);
  const seen = new Set();
  const items = result.items.map((item) => {
    if (!allowedIds.has(item.id)) throw new TypeError(`Unknown triage item id: ${item.id}`);
    if (seen.has(item.id)) throw new TypeError(`Duplicate triage item id: ${item.id}`);
    seen.add(item.id);
    if (!PRIORITIES.has(item.priority)) throw new TypeError("Invalid priority");
    if (!ACTIONS.has(item.recommendedAction)) throw new TypeError("Invalid recommended action");
    const score = Number(item.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new TypeError("Score must be between 0 and 100");
    return {
      id: item.id,
      score,
      priority: item.priority,
      recommendedAction: item.recommendedAction,
      reason: normalizeText(item.reason).slice(0, 280),
      commitment: item.commitment ? normalizeText(item.commitment).slice(0, 280) : null,
      dueAt: item.dueAt ? new Date(item.dueAt).toISOString() : null,
    };
  });
  return { summary: normalizeText(result.summary).slice(0, 800), items };
}

export function buildCatchMeUpBrief(validated, candidates) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ranked = [...validated.items].sort((a, b) => b.score - a.score);
  return {
    generatedAt: new Date().toISOString(),
    summary: validated.summary,
    critical: ranked.filter((item) => item.priority === "critical").map((item) => ({ ...item, candidate: byId.get(item.id) })),
    needsAttention: ranked.filter((item) => item.priority === "high" || item.priority === "normal").map((item) => ({ ...item, candidate: byId.get(item.id) })),
    lowPriority: ranked.filter((item) => item.priority === "low").map((item) => ({ ...item, candidate: byId.get(item.id) })),
  };
}
