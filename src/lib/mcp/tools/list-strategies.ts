import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { NOT_AUTHENTICATED, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_strategies",
  title: "List strategies",
  description:
    "List the signed-in user's saved PumpPilot strategies, or browse the public community feed.",
  inputSchema: {
    scope: z
      .enum(["mine", "public"])
      .optional()
      .describe("'mine' (default) for your strategies, 'public' for the community feed."),
    limit: z.number().int().optional().describe("Max rows (1-50, default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ scope, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    const max = Math.min(Math.max(limit ?? 20, 1), 50);

    let query = supabaseForUser(ctx)
      .from("strategies")
      .select("id,title,description,tags,is_public,likes_count,forks_count,created_at,author_id")
      .order("created_at", { ascending: false })
      .limit(max);

    query =
      scope === "public"
        ? query.eq("is_public", true)
        : query.eq("author_id", ctx.getUserId()!);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { count: data?.length ?? 0, strategies: data ?? [] },
    };
  },
});
