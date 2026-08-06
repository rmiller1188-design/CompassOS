import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { openAiClient } from "@/lib/openai";
import { env } from "@/lib/env";

const inputSchema = z.object({ workspaceId: z.string().uuid() });

type MessageRow = { subject: string | null; sender: string | null; preview: string | null; occurred_at: string; channel: string };
type EventRow = { title: string; starts_at: string; ends_at: string; location: string | null };
type TaskRow = { title: string; due_at: string | null; status: string };
type Brief = { headline: string; urgent: string[]; schedule: string[]; shared: string[] };

function localBrief(messages: MessageRow[], events: EventRow[], tasks: TaskRow[]): Brief {
  const now = Date.now();
  const day = 24 * 60 * 60_000;
  const urgentKeywords = /\b(urgent|asap|action required|past due|overdue|deadline|security alert|verify|payment due)\b/i;
  const dueSoon = tasks
    .filter(task => task.due_at && Date.parse(task.due_at) <= now + day)
    .slice(0, 5)
    .map(task => `${Date.parse(task.due_at || "") < now ? "Overdue" : "Due soon"}: ${task.title}`);
  const attentionMessages = messages
    .filter(message => urgentKeywords.test(`${message.subject || ""} ${message.preview || ""}`))
    .slice(0, Math.max(0, 5 - dueSoon.length))
    .map(message => `Message: ${message.subject || message.sender || "Needs review"}`);
  const upcoming = events.slice(0, 6).map(event => {
    const when = new Date(event.starts_at).toLocaleString();
    return `${event.title} — ${when}${event.location ? ` at ${event.location}` : ""}`;
  });
  const openTasks = tasks.slice(0, 6).map(task => `${task.title}${task.due_at ? ` — due ${new Date(task.due_at).toLocaleString()}` : ""}`);
  const todayEvents = events.filter(event => Date.parse(event.starts_at) < now + day).length;
  const recentMessages = messages.filter(message => Date.parse(message.occurred_at) > now - day).length;

  return {
    headline: `${openTasks.length} open follow-up${openTasks.length === 1 ? "" : "s"}, ${todayEvents} event${todayEvents === 1 ? "" : "s"} in the next day, and ${recentMessages} recent message${recentMessages === 1 ? "" : "s"}.`,
    urgent: [...dueSoon, ...attentionMessages],
    schedule: upcoming,
    shared: openTasks
  };
}

async function aiBrief(messages: MessageRow[], events: EventRow[], tasks: TaskRow[]): Promise<{ brief: Brief; model: string }> {
  const client = openAiClient();
  const model = env.openAiModel();
  const response = await client.responses.create({
    model,
    store: false,
    input: [
      {
        role: "developer",
        content: "Create a concise household communications brief. Never invent facts. Separate urgent actions, upcoming schedule, and shared follow-ups."
      },
      {
        role: "user",
        content: JSON.stringify({ messages, events, tasks })
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "compass_daily_brief",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["headline", "urgent", "schedule", "shared"],
          properties: {
            headline: { type: "string" },
            urgent: { type: "array", items: { type: "string" } },
            schedule: { type: "array", items: { type: "string" } },
            shared: { type: "array", items: { type: "string" } }
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
    const [messagesResult, eventsResult, tasksResult] = await Promise.all([
      admin.from("communication_items").select("subject,sender,preview,occurred_at,channel").eq("workspace_id", workspaceId).order("occurred_at", { ascending: false }).limit(30),
      admin.from("calendar_events").select("title,starts_at,ends_at,location").eq("workspace_id", workspaceId).gte("ends_at", new Date().toISOString()).order("starts_at").limit(15),
      admin.from("shared_tasks").select("title,due_at,status").eq("workspace_id", workspaceId).neq("status", "done").neq("status", "cancelled").order("due_at").limit(15)
    ]);

    for (const result of [messagesResult, eventsResult, tasksResult]) {
      if (result.error) throw new Error("BRIEF_SOURCE_QUERY_FAILED");
    }

    const messages = (messagesResult.data || []) as MessageRow[];
    const events = (eventsResult.data || []) as EventRow[];
    const tasks = (tasksResult.data || []) as TaskRow[];
    let brief = localBrief(messages, events, tasks);
    let model = "compass-local-v1";
    let mode: "local" | "ai" = "local";

    if (process.env.OPENAI_API_KEY) {
      try {
        const generated = await aiBrief(messages, events, tasks);
        brief = generated.brief;
        model = generated.model;
        mode = "ai";
      } catch (aiError) {
        console.error("Compass AI brief fell back to local mode", aiError instanceof Error ? aiError.message : aiError);
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
    console.error("Compass brief generation failed", message || error);
    return NextResponse.json({ error: "brief_generation_failed" }, { status: 500 });
  }
}
