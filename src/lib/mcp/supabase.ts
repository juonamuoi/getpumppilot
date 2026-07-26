import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/** Supabase client scoped to the MCP caller — RLS runs as that user. */
export function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client used ONLY for the audit/rate-limit routines, which are
 * not executable by anon or authenticated roles. Never use it to read or write
 * user data — tool handlers must keep using `supabaseForUser` so RLS applies.
 */
export function supabaseAdminForAudit() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const NOT_AUTHENTICATED = {
  content: [{ type: "text" as const, text: "Not authenticated" }],
  isError: true,
};
