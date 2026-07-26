import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

/** Requests allowed per user, per rolling window, across all MCP tools. */
export const RATE_LIMIT = 60;
export const RATE_WINDOW_SECONDS = 60;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function errorResult(text: string, structured: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured, isError: true };
}

/** Only log a redacted, bounded shape of the input — never full payloads. */
function summarizeInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = value.length > 64 ? `${value.slice(0, 64)}…` : value;
    else if (Array.isArray(value)) out[key] = `array(${value.length})`;
    else out[key] = "object";
  }
  return out;
}

type AuditedTool<TInput> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  /** Set for tools that work without a signed-in caller (no audit trail possible). */
  allowAnonymous?: boolean;
  handler: (input: TInput, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
};

/**
 * Wraps a tool handler with a correlation ID, a per-user rate limit, consent-grant
 * tracking, and start/finish audit rows. All bookkeeping runs through SECURITY
 * DEFINER routines keyed on the verified token's user, so callers cannot forge it.
 */
export function defineAuditedTool<TInput>(config: AuditedTool<TInput>) {
  const { allowAnonymous, handler, ...rest } = config;

  return defineTool({
    ...(rest as never),
    handler: async (input: TInput, ctx: ToolContext) => {
      const correlationId = crypto.randomUUID();

      if (!ctx.isAuthenticated()) {
        if (allowAnonymous) return handler(input, ctx);
        return errorResult("Not authenticated", { correlation_id: correlationId });
      }

      const supabase = supabaseForUser(ctx);
      const request = summarizeInput(input);
      const clientId = ctx.getClientId?.() ?? null;

      const { data: gate, error: gateError } = await supabase.rpc("mcp_begin_call", {
        _correlation_id: correlationId,
        _client_id: clientId,
        _tool_name: config.name,
        _request: request,
        _limit: RATE_LIMIT,
        _window_seconds: RATE_WINDOW_SECONDS,
      });

      if (gateError) {
        return errorResult(`Audit gate unavailable: ${gateError.message}`, {
          correlation_id: correlationId,
        });
      }

      const verdict = (gate ?? {}) as {
        allowed?: boolean;
        reason?: string;
        retry_after_seconds?: number;
        remaining?: number;
      };

      if (!verdict.allowed) {
        const text =
          verdict.reason === "rate_limited"
            ? `Rate limit exceeded: max ${RATE_LIMIT} MCP requests per ${RATE_WINDOW_SECONDS}s. Retry in ${verdict.retry_after_seconds ?? RATE_WINDOW_SECONDS}s. (correlation_id ${correlationId})`
            : verdict.reason === "revoked"
              ? `Access for this agent client was revoked in PumpPilot AI. Reconnect from Settings to continue. (correlation_id ${correlationId})`
              : `Request denied (${verdict.reason ?? "unknown"}). (correlation_id ${correlationId})`;
        return errorResult(text, { correlation_id: correlationId, ...verdict });
      }

      const startedAt = Date.now();
      let result: ToolResult;
      let status = "ok";
      let errorMessage: string | null = null;

      try {
        result = await handler(input, ctx);
        if (result.isError) {
          status = "error";
          errorMessage = result.content?.[0]?.text ?? "Tool returned an error";
        }
      } catch (err) {
        status = "exception";
        errorMessage = err instanceof Error ? err.message : String(err);
        result = errorResult(`Tool failed: ${errorMessage}`, { correlation_id: correlationId });
      }

      await supabase.rpc("mcp_finish_call", {
        _correlation_id: correlationId,
        _status: status,
        _duration_ms: Date.now() - startedAt,
        _error_message: errorMessage,
      });

      return {
        ...result,
        structuredContent: {
          ...(result.structuredContent ?? {}),
          correlation_id: correlationId,
          rate_limit: {
            limit: RATE_LIMIT,
            window_seconds: RATE_WINDOW_SECONDS,
            remaining: verdict.remaining ?? null,
          },
        },
      };
    },
  } as never);
}
