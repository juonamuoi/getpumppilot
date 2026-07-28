import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Internal marketing/analytics endpoints are admin-only. Roles live in
 * public.user_roles and are checked through the security-definer has_role
 * function using the CALLER's client, never the service-role client.
 */
export async function assertAdmin(
  supabase: SupabaseClient<never>,
  userId: string,
): Promise<void> {
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>;
  }).rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || data !== true) throw new Error("Forbidden: admin role required.");
}
