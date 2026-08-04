import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const admin = createAdminClient();

    const { data: connection, error: lookupError } = await admin
      .from("provider_connections")
      .select("id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();
    if (lookupError || !connection) throw new Error("CONNECTION_NOT_FOUND");

    const credentialDelete = await admin
      .from("provider_credentials")
      .delete()
      .eq("connection_id", connection.id);
    if (credentialDelete.error) throw credentialDelete.error;

    const { error: updateError } = await admin
      .from("provider_connections")
      .update({
        status: "disconnected",
        token_expires_at: null,
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", connection.id)
      .eq("owner_id", user.id);
    if (updateError) throw updateError;

    return NextResponse.json({ disconnected: true, importedDataPreserved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to disconnect account";
    const status = message === "UNAUTHORIZED" ? 401 : message === "CONNECTION_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
