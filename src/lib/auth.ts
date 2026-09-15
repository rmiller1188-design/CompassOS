import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireApiUser(): Promise<User> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return data.user;
}

export async function authenticateBearer(request: Request): Promise<User> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = header.slice("Bearer ".length);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return data.user;
}

export async function assertProfileOwner(userId: string, profileId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, owner_id")
    .eq("id", profileId)
    .eq("owner_id", userId)
    .single();
  if (error || !data) throw new Error("PROFILE_FORBIDDEN");
  return data;
}

export async function assertWorkspaceMember(userId: string, workspaceId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("WORKSPACE_FORBIDDEN");
  return data;
}
