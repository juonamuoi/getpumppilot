import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { NOT_AUTHENTICATED, supabaseForUser } from "../supabase";

/**
 * Read-only quota probe. Deliberately NOT wrapped in `defineAuditedTool`: a status
 * check must not consume the very quota it reports, so it neither rate-limits nor
 * writes an audit row. The underlying routine only ever reports the caller's own
 * quota (it resolves the user from the verified token via auth.uid()).
 */
export default defineTool({
  name: "rate_limit_status",
  title: "Rate limit status",
  description:
    "Report remaining MCP tool calls for the signed-in account and for a given agent client, plus the seconds until the next call is allowed. Reading this does not consume quota.",
  inputSchema: {
    client_id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .nullable()
      .describe("Agent client ID to report per-agent quota for. Null uses the calling agent."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ client_id }: { client_id: string | null }, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;

    const clientId = client_id ?? ctx.getClientId?.() ?? null;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_rate_limit_status", {
      _user_id: ctx.getUserId()!,
      _client_id: clientId ?? undefined,
    });

    if (error) return { content: [{ type: "text" as const, text: error.message }], isError: true };

    const payload = (data ?? {}) as Record<string, unknown>;
    if (typeof payload.error === "string") {
      return {
        content: [{ type: "text" as const, text: `Rate limit status: ${payload.error}` }],
        isError: true,
      };
    }

    const account = (payload.account ?? {}) as Record<string, unknown>;
    const client = (payload.client ?? null) as Record<string, unknown> | null;
    const summary = [
      `Account: ${account.remaining ?? "?"}/${account.limit ?? "?"} calls left in the last ${payload.window_seconds ?? "?"}s.`,
      client
        ? `Agent "${client.client_id}": ${client.remaining}/${client.limit} left${client.revoked ? " (access revoked)" : ""}.`
        : "No agent client specified.",
      Number(payload.retry_after_seconds ?? 0) > 0
        ? `Throttled — retry after ${payload.retry_after_seconds}s (${payload.next_retry_at}).`
        : "Not throttled — calls are allowed now.",
    ].join(" ");

    return {
      content: [{ type: "text" as const, text: summary }],
      structuredContent: payload,
    };
  },
} as never);
