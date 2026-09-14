import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { openAiClient } from "@/lib/openai";
import { env } from "@/lib/env";

const inputSchema = z.object({ workspaceId: z.string().uuid() });

type MessageRow = { subject: string | null; sender: string | null; preview: string | null; occurred_at: string; channel: string; provider: string; connection_id: string | null };
type EventRow = { title: string; starts_at: string; ends_at: string; location: string | null; provider: string; connection_id: string | null };
type TaskRow = { title: string; due_at: string | null; status: string };
type AccountRow = { id: string; provider: string; account_email: string; status: string; last_sync_at: string | null; last_error: string | null };
type Brief = { headline: string; urgent: string[]; schedule: string[]; followUps: string[] };

type BriefContext = {
  messages: Array<{ source: string; sender: string | null; subject: string | null; preview: string | null; occurredAt: string }>;
  events: Array<{ source: string; title: string; startsAt: string; endsAt: string; location: string | null }>;
  tasks: TaskRow[];
  accountHealth: Array<{ source: string; status: string; lastSyncAt: string | null; lastError: string | null }>;
};

function providerLabel(provider: string): string {
  return provider === "microsoft" ? "Outlook" : provider === "google" ? "Gmail" : provider;
}

function sourceLabel(provider: string, connectionId: string | null, accounts: Map<string, AccountRow>): string {
  const account = connectionId ? accounts.get(connectionId) : null;
  const provider = providerLabel(account?.provider || provider);
  return account?.account_email ? `${provider} · ${account.account_email}` : provider;
}

function buildContext(messages: MessageRow[], events: EventRow[], tasks: TaskRow[], accounts: AccountRow[]): BriefContext {
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  return {
    messages: messages.map(message => ({
      source: message.channel === "sms" ? "Texts" : sourceLabel(message.provider, message.connection_id, accountMap),
      sender: message.sender,
      subject: message.subject,
      preview: message.preview,
      occurredAt: message.occurred_at
    })),
    events: events.map(event => ({
      source: sourceLabel(event.provider, event.connection_id, accountMap).replace(/^Gmail/, "Google Calendar"),
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      location: event.location
    })),
    tasks,
    accountHealth: accounts.map(account => ({
      source: `${providerLabel(account.provider)} · ${account.account_email}`,
      status: account.status,
      lastSyncAt: account.last_sync_at,
      lastError: account.last_error
    }))
  };
}

function localBrief(context: BriefContext): Brief {
  const now = Date.now();
  const day = 24 * 60 * 60_000;
  const urgentKeywords = /\b(urgent|asap|action required|past due|overdue|deadline|security alert|verify|payment due)\b/i;
  const dueSoon = context.tasks
    .filter(task => task.due_at && Date.parse(task.due_at) <= now + day)
    .slice(0, 5)
    .map(task => `${Date.parse(task.due_at || "") < now ? "Overdue" : "Due soon"}: ${task.title}`);
  const accountIssues = context.accountHealth
    .filter(account => !["healthy", "syncing"].includes(account.status))
    .slice(0, Math.max(0, 5 - dueSoon.length))
    .map(account => `${account.source}: ${account.status.replace("_", " ")}`);
  const attentionMessages = context.messages
    .filter(message => urgentKeywords.test(`${message.subject || ""} ${message.preview || ""}`))
    .slice(0, Math.max(0, 5 - dueSoon.length - accountIssues.length))
    .map(message => `${message.source}: ${message.subject || message.sender || "Needs review"}`);
  const upcoming = context.events.slice(0, 6).map(event => {
    const when = new Date(event.startsAt).toLocaleString();
    return `${event.title} — ${when}${event.location ? ` at ${event.location}` : ""} · ${event.source}`;
  });
  const openTasks = context.tasks.slice(0, 6).map(task => `${task.title}${task.due_at ? ` — due ${new Date(task.due_at).toLocaleString()}` : ""}`);
  const todayEvents = context.events.filter(event => Date.parse(event.startsAt) < now + day).length;
  const recentMessages = context.messages.filter(message => Date.parse(message.occurredAt) > now - day).length;
  const unhealthyAccounts = context.accountHealth.filter(account => !["healthy", "syncing"].includes(account.status)).length;

  return {
    headline: `${openTasks.length} open follow-up${openTasks.length === 1 ? "" : "s"}, ${todayEvents} event${todayEvents === 1 ? "" : "s"} in the next day, ${recentMessages} recent message${recentMessages === 1 ? "" : "s"}${unhealthyAccounts ? `, and ${unhealthyAccounts} account issue${unhealthyAccounts === 1 ? "" : "s"}` : ""}.`,
    urgent: [...dueSoon, ...accountIssues, ...attentionMessages],
    schedule: upcoming,
    followUps: openTasks
  };
}

async function aiBrief(context: BriefContext): Promise<{ brief: Brief; model: string }> {
  const client = openAiClient();
  const model = env.openAiModel();
  const response = await client.responses.create({
    model,
    store: false,
    input: [
      {
        role: "developer",
        content: "Create a concise executive operating brief from the supplied private CompassOS context. Never invent facts, obligations, urgency, people, dates, or account state. Preserve provider/account identity when it clarifies where an item lives. Prioritize genuine exceptions, deadlines, account failures, near-term schedule, and concrete follow-ups. Do not call this a household brief unless the supplied data itself is explicitly shared household data."
      },
      {
        role: "user",
        content: JSON.stringify(context)
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "compass_executive_brief",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["headline", "urgent", "schedule", "followUps"],
          properties: {
            headline: { type: "string" },
            urgent: { type: "array", items: { type: "string" } },
            schedule: { type: "array", items: { type: "string" } },
            followUps: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  });
  if (!response.output_text) throw new Error("BRIEF_RESPONSE_EMPTY");
  return { brief: JSON.parse(response.output_text) as Brief, model };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const { workspaceId } = inputSchema.parse(await request.json());
    await assertWorkspaceMember(user.id, workspaceId);

    const admin = createAdminClient();
    const [messagesResult, eventsResult, tasksResult, accountsResult] = await Promise.all([
      admin.from("communication_items").select("subject,sender,preview,occurred_at,channel,provider,connection_id").eq("workspace_id", workspaceId).order("occurred_at", { ascending: false }).limit(40),
      admin.from("calendar_events").select("title,starts_at,ends_at,location,provider,connection_id").eq("workspace_id", workspaceId).gte("ends_at", new Date().toISOString()).order("starts_at").limit(20),
      admin.from("shared_tasks").select("title,due_at,status").eq("workspace_id", workspaceId).neq("status", "done").neq("status", "cancelled").order("due_at").limit(20),
      admin.from("provider_connections").select("id,provider,account_email,status,last_sync_at,last_error").eq("owner_id", user.id).order("provider")
    ]);

    for (const result of [messagesResult, eventsResult, tasksResult, accountsResult]) {
      if (result.error) throw new Error("BRIEF_SOURCE_QUERY_FAILED");
    }

    const context = buildContext(
      (messagesResult.data || []) as MessageRow[],
      (eventsResult.data || []) as EventRow[],
      (tasksResult.data || []) as TaskRow[],
      (accountsResult.data || []) as AccountRow[]
    );
    let brief = localBrief(context);
    let model = "compass-local-v2";
    let mode: "local" | "ai" = "local";

    if (process.env.OPENAI_API_KEY) {
      try {
        const generated = await aiBrief(context);
        brief = generated.brief;
        model = generated.model;
        mode = "ai";
      } catch (aiError) {
        console.error("Compass AI executive brief fell back to local mode", aiError instanceof Error ? aiError.message : aiError);
      }
    }

    const stored = await admin.from("ai_briefs").insert({ owner_id: user.id, workspace_id: workspaceId, brief, model });
    if (stored.error) throw new Error("BRIEF_STORAGE_FAILED");

    return NextResponse.json({ brief, mode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "WORKSPACE_FORBIDDEN") return NextResponse.json({ error: "workspace_forbidden" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    console.error("Compass executive brief generation failed", message || error);
    return NextResponse.json({ error: "brief_generation_failed" }, { status: 500 });
  }
}
