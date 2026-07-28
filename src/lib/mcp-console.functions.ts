import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RunInput = z.object({
  tool: z.string().min(1).max(64),
  mode: z.enum(["mock", "live"]),
  input: z.string().max(4000).default("{}"),
});

export const listConsoleTools = createServerFn({ method: "GET" }).handler(async () => {
  const { toolCatalog } = await import("./mcp-console.server");
  return toolCatalog();
});

export const runConsoleToolCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RunInput.parse(data))
  .handler(async ({ data, context }) => {
    const { runConsoleTool } = await import("./mcp-console.server");

    let parsedInput: unknown;
    try {
      parsedInput = data.input.trim() ? JSON.parse(data.input) : {};
    } catch {
      throw new Error("Input must be valid JSON.");
    }

    const email =
      (context.claims as { email?: string } | undefined)?.email ?? null;

    return runConsoleTool({
      tool: data.tool,
      input: parsedInput,
      mode: data.mode,
      userId: context.userId,
      email,
    });
  });
