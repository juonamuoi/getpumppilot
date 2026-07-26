import { defineAuditedTool } from "../audit";
import { z } from "zod";
import { NOT_AUTHENTICATED, supabaseForUser } from "../supabase";

export default defineAuditedTool({
  name: "create_strategy",
  title: "Create strategy",
  description:
    "Save a new paper-trading strategy for the signed-in user. Strategies never execute live trades.",
  inputSchema: {
    title: z.string().describe("Strategy name."),
    description: z.string().optional().describe("What the strategy does."),
    tags: z.array(z.string()).optional().describe("Optional tags, e.g. ['momentum','swing']."),
    is_public: z.boolean().optional().describe("Publish to the community feed (default false)."),
    config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Optional strategy rule configuration object."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, description, tags, is_public, config }, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;

    const name = title.trim();
    if (!name) return { content: [{ type: "text", text: "Title is required" }], isError: true };

    const { data, error } = await supabaseForUser(ctx)
      .from("strategies")
      .insert({
        author_id: ctx.getUserId()!,
        title: name,
        description: description ?? null,
        tags: tags ?? [],
        is_public: is_public ?? false,
        config: (config ?? {}) as never,
      })
      .select()
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Created strategy "${name}" (${data.id}).` }],
      structuredContent: { strategy: data },
    };
  },
});
