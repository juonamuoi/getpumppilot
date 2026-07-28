import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import type { z } from "zod";
import { supabaseAdminForAudit } from "./supabase";

/** Requests allowed per user, per rolling window, across all MCP tools and agents. */
export const RATE_LIMIT = 60;
/** Requests allowed per user *per connected agent client*, same rolling window. */
export const CLIENT_RATE_LIMIT = 30;
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

type Shape = Record<string, z.ZodTypeAny>;
type InputOf<TSchema extends Shape> = z.infer<z.ZodObject<TSchema>>;

type AuditedTool<TSchema extends Shape> = {
  name: string;
  title: string;
  description: string;
  inputSchema: TSchema;
  annotations?: Record<string, unknown>;
  /** Set for tools that work without a signed-in caller (no audit trail possible). */
  allowAnonymous?: boolean;
  handler: (input: InputOf<TSchema>, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
};

/**
 * Wraps a tool handler with a correlation ID, a per-user rate limit, consent-grant
 * tracking, and start/finish audit rows. All bookkeeping runs through SECURITY
 * DEFINER routines keyed on the verified token's user, so callers cannot forge it.
 */
export function defineAuditedTool<TSchema extends Shape>(config: AuditedTool<TSchema>) {
  const { allowAnonymous, handler } = config;
  const rest: Record<string, unknown> = {
    name: config.name,
    title: config.title,
    description: config.description,
    inputSchema: config.inputSchema,
    annotations: config.annotations,
  };

  return defineTool({
    ...rest,

    handler: async (input: InputOf<TSchema>, ctx: ToolContext) => {
      const correlationId = crypto.randomUUID();

      if (!ctx.isAuthenticated()) {
        if (allowAnonymous) return handler(input, ctx);
        return errorResult("Not authenticated", { correlation_id: correlationId });
      }

      const userId = ctx.getUserId();
      if (!userId) {
        return errorResult("Not authenticated", { correlation_id: correlationId });
      }

      // Audit + rate limiting run through server-only routines with the
      // verified token subject, so a client can never forge or bypass them.
      const supabase = supabaseAdminForAudit();
      const request = summarizeInput(input);
      const clientId = ctx.getClientId?.() ?? null;

      const { data: gate, error: gateError } = await supabase.rpc("mcp_begin_call", {
        _user_id: userId,
        _correlation_id: correlationId,
        _client_id: clientId,
        _tool_name: config.name,
        _request: request,
        _limit: RATE_LIMIT,
        _window_seconds: RATE_WINDOW_SECONDS,
        _client_limit: CLIENT_RATE_LIMIT,
      });

      if (gateError) {
        return errorResult(`Audit gate unavailable: ${gateError.message}`, {
          correlation_id: correlationId,
        });
      }

      const verdict = (gate ?? {}) as {
        allowed?: boolean;
        reason?: string;
        scope?: "account" | "client";
        limit?: number;
        used?: number;
        window_seconds?: number;
        retry_after_seconds?: number;
        remaining?: number;
        client_limit?: number;
        client_remaining?: number;
        client_id?: string;
      };

      if (!verdict.allowed) {
        const retryAfter = verdict.retry_after_seconds ?? RATE_WINDOW_SECONDS;
        const who = verdict.client_id ?? clientId ?? "unknown";
        let text: string;
        if (verdict.reason === "rate_limited") {
          text =
            verdict.scope === "client"
              ? `Throttled: agent client "${who}" exceeded its limit of ${verdict.limit ?? CLIENT_RATE_LIMIT} MCP tool calls per ${verdict.window_seconds ?? RATE_WINDOW_SECONDS}s (${verdict.used ?? "?"} used). Retry after ${retryAfter}s, or slow this integration down — other agents on your account are unaffected. (correlation_id ${correlationId})`
              : `Throttled: your account exceeded ${verdict.limit ?? RATE_LIMIT} MCP tool calls per ${verdict.window_seconds ?? RATE_WINDOW_SECONDS}s across all connected agents (${verdict.used ?? "?"} used). Retry after ${retryAfter}s. (correlation_id ${correlationId})`;
        } else if (verdict.reason === "revoked") {
          text = `Access for agent client "${who}" was revoked in PumpPilot AI. Reconnect from Settings → Connected agents to continue. (correlation_id ${correlationId})`;
        } else {
          text = `Request denied (${verdict.reason ?? "unknown"}). (correlation_id ${correlationId})`;
        }
        return errorResult(text, {
          correlation_id: correlationId,
          retry_after_seconds: verdict.reason === "rate_limited" ? retryAfter : undefined,
          ...verdict,
        });
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
        _user_id: userId,
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
