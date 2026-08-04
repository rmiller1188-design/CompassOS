import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { openAiClient } from "@/lib/openai";
import { env } from "@/lib/env";

const inputSchema = z.object({ workspaceId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const { workspaceId } = inputSchema.parse(await request.json());
    await assertWorkspaceMember(user.id, workspaceId);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    }

    const admin = createAdminClient();
    const [messages, events, tasks] = await Promise.all([
      admin.from("communication_items").select("subject,sender,preview,occurred_at,channel").eq("workspace_id", workspaceId).order("occurred_at", { ascending: false }).limit(30),
      admin.from("calendar_events").select("title,starts_at,ends_at,location").eq("workspace_id", workspaceId).gte("ends_at", new Date().toISOString()).order("starts_at").limit(15),
      admin.from("shared_tasks").select("title,due_at,status").eq("workspace_id", workspaceId).neq("status", "done").order("due_at").limit(15)
    ]);

    for (const result of [messages, events, tasks]) {
      if (result.error) throw new Error("BRIEF_SOURCE_QUERY_FAILED");
    }

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
          content: JSON.stringify({ messages: messages.data || [], events: events.data || [], tasks: tasks.data || [] })
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
    const brief = JSON.parse(response.output_text) as unknown;
    const stored = await admin.from("ai_briefs").insert({ owner_id: user.id, workspace_id: workspaceId, brief, model });
    if (stored.error) throw new Error("BRIEF_STORAGE_FAILED");

    return NextResponse.json({ brief });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    console.error("Compass brief generation failed", message || error);
    return NextResponse.json({ error: "brief_generation_failed" }, { status: 500 });
  }
}
