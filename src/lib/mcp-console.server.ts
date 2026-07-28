import type { ToolContext } from "@lovable.dev/mcp-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import momentumScan from "@/lib/mcp/tools/momentum-scan";
import momentumExplain from "@/lib/mcp/tools/momentum-explain";
import listStrategies from "@/lib/mcp/tools/list-strategies";
import createStrategy from "@/lib/mcp/tools/create-strategy";
import subscriptionStatus from "@/lib/mcp/tools/subscription-status";
import { CLIENT_RATE_LIMIT, RATE_LIMIT, RATE_WINDOW_SECONDS } from "@/lib/mcp/audit";

type AnyTool = {
  name: string;
  title?: string;
  description?: string;
  annotations?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  handler: (input: unknown, ctx: ToolContext) => unknown;
};

const TOOLS = [
  momentumScan,
  momentumExplain,
  listStrategies,
  createStrategy,
  subscriptionStatus,
] as unknown as AnyTool[];

/** Example input + canned response used by the console's mock mode. */
const FIXTURES: Record<string, { example: Record<string, unknown>; mock: unknown }> = {
  momentum_scan: {
    example: { limit: 3 },
    mock: {
      count: 2,
      disclaimer: "Mock console fixture — no live data was read.",
      data: [
        { symbol: "SOL", momentum: 86, change24h: 6.1, reason: "Breakout with expanding volume." },
        { symbol: "BTC", momentum: 78, change24h: 2.34, reason: "Above 30d resistance." },
      ],
    },
  },
  momentum_explain: {
    example: { symbol: "BTC", preset: "balanced" },
    mock: {
      symbol: "BTC",
      preset: "balanced",
      matches: true,
      momentum: { total: 78, trend: 82, volume: 74, volatility: 61, social: 80, breakout: 88 },
      nearMissRisk: { nearMissCount: 0, bindingConstraint: "minVolumeScore", bindingSlack: 14, fragility: 0 },
      disclaimer: "Mock console fixture — no live data was read.",
    },
  },
  list_strategies: {
    example: { scope: "mine" },
    mock: {
      count: 1,
      data: [{ id: "mock-strategy-1", name: "Demo breakout", scope: "mine", isMock: true }],
    },
  },
  create_strategy: {
    example: { name: "Console smoke test", minMomentum: 75 },
    mock: { created: false, note: "Mock mode never writes. Switch to Live to persist a strategy." },
  },
  subscription_status: {
    example: {},
    mock: { plan: "pro", status: "active", isMock: true },
  },
};

const REDACT_KEY = /(token|secret|api[_-]?key|password|authorization|bearer|private|seed|mnemonic)/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g;
const MAX_STRING = 600;

/** Strip credentials and PII from anything the console renders back to the user. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[max depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const masked = value.replace(JWT, "[redacted-token]").replace(EMAIL, "[redacted-email]");
    return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}…[truncated]` : masked;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEY.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return "[unsupported]";
}

export function toolCatalog() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title ?? t.name,
    description: t.description ?? "",
    readOnly: Boolean((t.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint),
    exampleInput: JSON.stringify(FIXTURES[t.name]?.example ?? {}, null, 2),
  }));
}

/** Duck-typed ToolContext backed by the console caller's verified session. */
function consoleContext(userId: string, email: string | null): ToolContext {
  const token = (getRequestHeader("authorization") ?? "").replace(/^Bearer\s+/i, "") || undefined;
  return {
    isAuthenticated: () => Boolean(userId),
    getToken: () => token,
    getUserId: () => userId,
    getUserEmail: () => email ?? undefined,
    getClientId: () => "pumppilot-test-console",
    getClaims: () => ({ sub: userId }),
  } as unknown as ToolContext;
}

export type ConsoleQuota = {
  limit: number;
  remaining: number | null;
  windowSeconds: number;
  clientId: string | null;
  clientLimit: number;
  clientRemaining: number | null;
};

export type ConsoleThrottle = {
  reason: string;
  scope: "account" | "client" | "unknown";
  limit: number;
  used: number | null;
  windowSeconds: number;
  retryAfterSeconds: number;
  /** Server clock at the moment the throttle was issued (ms epoch). */
  issuedAt: number;
  clientId: string | null;
};

export type ConsoleRun = {
  mode: "mock" | "live";
  tool: string;
  auditId: string | null;
  correlationId: string | null;
  durationMs: number;
  isError: boolean;
  text: string;
  structuredJson: string;
  quota: ConsoleQuota | null;
  throttle: ConsoleThrottle | null;
};

export async function runConsoleTool(opts: {
  tool: string;
  input: unknown;
  mode: "mock" | "live";
  userId: string;
  email: string | null;
}): Promise<ConsoleRun> {
  const tool = TOOLS.find((t) => t.name === opts.tool);
  if (!tool) throw new Error(`Unknown tool "${opts.tool}"`);

  const startedAt = Date.now();

  if (opts.mode === "mock") {
    const payload = FIXTURES[tool.name]?.mock ?? { note: "No fixture defined for this tool." };
    const auditId = `MOCK-${crypto.randomUUID()}`;
    return {
      mode: "mock",
      tool: tool.name,
      auditId,
      correlationId: auditId,
      durationMs: Date.now() - startedAt,
      isError: false,
      text: JSON.stringify(sanitize(payload), null, 2),
      structuredJson: JSON.stringify(sanitize(payload), null, 2),
      quota: null,
      throttle: null,
    };
  }

  const ctx = consoleContext(opts.userId, opts.email);
  const raw = (await tool.handler(opts.input, ctx)) as {
    content?: Array<{ text?: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };

  const structured = (raw.structuredContent ?? {}) as Record<string, unknown>;
  const correlationId = typeof structured.correlation_id === "string" ? structured.correlation_id : null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);

  const rl = (structured.rate_limit ?? null) as Record<string, unknown> | null;
  const quota: ConsoleQuota | null = rl
    ? {
        limit: num(rl.limit) ?? RATE_LIMIT,
        remaining: num(rl.remaining),
        windowSeconds: num(rl.window_seconds) ?? RATE_WINDOW_SECONDS,
        clientId: str(rl.client_id),
        clientLimit: num(rl.client_limit) ?? CLIENT_RATE_LIMIT,
        clientRemaining: num(rl.client_remaining),
      }
    : null;

  const reason = str(structured.reason);
  const throttled = raw.isError && reason === "rate_limited";
  const scopeRaw = str(structured.scope);
  const throttle: ConsoleThrottle | null = throttled
    ? {
        reason,
        scope: scopeRaw === "client" || scopeRaw === "account" ? scopeRaw : "unknown",
        limit: num(structured.limit) ?? RATE_LIMIT,
        used: num(structured.used),
        windowSeconds: num(structured.window_seconds) ?? RATE_WINDOW_SECONDS,
        retryAfterSeconds: num(structured.retry_after_seconds) ?? RATE_WINDOW_SECONDS,
        issuedAt: Date.now(),
        clientId: str(structured.client_id),
      }
    : null;

  return {
    mode: "live",
    tool: tool.name,
    auditId: correlationId,
    correlationId,
    durationMs: Date.now() - startedAt,
    isError: Boolean(raw.isError),
    text: String(sanitize(raw.content?.[0]?.text ?? "")),
    structuredJson: JSON.stringify(sanitize(structured), null, 2),
    quota,
    throttle,
  };
}
