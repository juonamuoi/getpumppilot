import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MCP throttling regression suite.
 *
 * Verifies that the audited tool wrapper:
 *  - enforces the account-wide limit per user (one user's traffic never throttles another),
 *  - enforces the per-agent-client limit independently of other agents on the same account,
 *  - returns `retry_after_seconds` and a `correlation_id` on every throttled response,
 *  - never runs the tool handler once throttled.
 */

// The MCP SDK's defineTool is a passthrough here so the wrapped handler is callable.
vi.mock("@lovable.dev/mcp-js", () => ({
  defineTool: (config: unknown) => config,
}));

const rpc = vi.fn();
vi.mock("@/lib/mcp/supabase", () => ({
  supabaseAdminForAudit: () => ({ rpc }),
  supabaseForUser: () => ({}),
  NOT_AUTHENTICATED: { content: [{ type: "text", text: "Not authenticated" }], isError: true },
}));

const { defineAuditedTool, RATE_LIMIT, CLIENT_RATE_LIMIT, RATE_WINDOW_SECONDS } = await import(
  "@/lib/mcp/audit"
);

type Verdict = Record<string, unknown>;

/** Minimal in-memory stand-in for the `mcp_begin_call` SECURITY DEFINER routine. */
function createGate() {
  const accountUsed = new Map<string, number>();
  const clientUsed = new Map<string, number>();
  const revoked = new Set<string>();

  return {
    revoke: (clientId: string) => revoked.add(clientId),
    calls: [] as Array<Record<string, unknown>>,
    handle(args: Record<string, unknown>): Verdict {
      const userId = String(args._user_id);
      const clientId = args._client_id == null ? null : String(args._client_id);
      const limit = Number(args._limit);
      const clientLimit = Number(args._client_limit);
      const windowSeconds = Number(args._window_seconds);

      if (clientId && revoked.has(clientId)) {
        return { allowed: false, reason: "revoked", client_id: clientId };
      }

      const accountKey = userId;
      const clientKey = `${userId}::${clientId ?? "-"}`;
      const accountNext = (accountUsed.get(accountKey) ?? 0) + 1;
      const clientNext = (clientUsed.get(clientKey) ?? 0) + 1;

      if (accountNext > limit) {
        return {
          allowed: false,
          reason: "rate_limited",
          scope: "account",
          limit,
          used: accountNext - 1,
          window_seconds: windowSeconds,
          retry_after_seconds: 17,
          client_id: clientId,
        };
      }

      if (clientId && clientNext > clientLimit) {
        return {
          allowed: false,
          reason: "rate_limited",
          scope: "client",
          limit: clientLimit,
          used: clientNext - 1,
          window_seconds: windowSeconds,
          retry_after_seconds: 9,
          client_id: clientId,
        };
      }

      accountUsed.set(accountKey, accountNext);
      clientUsed.set(clientKey, clientNext);
      return {
        allowed: true,
        remaining: limit - accountNext,
        client_limit: clientLimit,
        client_remaining: clientId ? clientLimit - clientNext : null,
        client_id: clientId,
        window_seconds: windowSeconds,
      };
    },
  };
}

function makeCtx(userId: string | null, clientId: string | null) {
  return {
    isAuthenticated: () => userId !== null,
    getUserId: () => userId,
    getClientId: () => clientId,
    getUserEmail: () => null,
    getClaims: () => ({}),
    getToken: () => "token",
  } as never;
}

let gate: ReturnType<typeof createGate>;
const handlerSpy = vi.fn();

function buildTool() {
  handlerSpy.mockImplementation(() => ({ content: [{ type: "text" as const, text: "ok" }] }));
  return defineAuditedTool({
    name: "throttle_probe",
    title: "Throttle probe",
    description: "Test tool used by the throttling regression suite.",
    inputSchema: {},
    handler: handlerSpy as never,
  }) as unknown as {
    handler: (input: unknown, ctx: unknown) => Promise<{
      isError?: boolean;
      content: Array<{ text: string }>;
      structuredContent?: Record<string, unknown>;
    }>;
  };
}

beforeEach(() => {
  gate = createGate();
  handlerSpy.mockReset();
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "mcp_begin_call") return { data: gate.handle(args), error: null };
    return { data: null, error: null };
  });
});

async function callN(tool: ReturnType<typeof buildTool>, ctx: unknown, n: number) {
  const results = [];
  for (let i = 0; i < n; i++) results.push(await tool.handler({}, ctx));
  return results;
}

describe("MCP per-account throttling", () => {
  it("allows calls up to the account limit and throttles the next one", async () => {
    const tool = buildTool();
    const ctx = makeCtx("user_a", null);

    const allowed = await callN(tool, ctx, RATE_LIMIT);
    expect(allowed.every((r) => !r.isError)).toBe(true);

    const throttled = await tool.handler({}, ctx);
    expect(throttled.isError).toBe(true);
    expect(throttled.content[0].text).toMatch(/Throttled: your account exceeded/);
    expect(throttled.structuredContent?.scope).toBe("account");
  });

  it("does not let one user's traffic throttle another user", async () => {
    const tool = buildTool();
    const busy = makeCtx("user_a", null);
    const quiet = makeCtx("user_b", null);

    await callN(tool, busy, RATE_LIMIT);
    expect((await tool.handler({}, busy)).isError).toBe(true);

    const other = await tool.handler({}, quiet);
    expect(other.isError).toBeFalsy();
    expect(other.structuredContent?.correlation_id).toEqual(expect.any(String));
  });
});

describe("MCP per-agent throttling", () => {
  it("throttles the noisy agent client while other agents keep working", async () => {
    const tool = buildTool();
    const noisy = makeCtx("user_a", "agent_noisy");
    const calm = makeCtx("user_a", "agent_calm");

    await callN(tool, noisy, CLIENT_RATE_LIMIT);
    const throttled = await tool.handler({}, noisy);

    expect(throttled.isError).toBe(true);
    expect(throttled.structuredContent?.scope).toBe("client");
    expect(throttled.structuredContent?.client_id).toBe("agent_noisy");
    expect(throttled.content[0].text).toMatch(/agent client "agent_noisy" exceeded its limit/);

    const other = await tool.handler({}, calm);
    expect(other.isError).toBeFalsy();
  });

  it("reports the per-agent limit, not the account limit, in the client-scope message", async () => {
    const tool = buildTool();
    const ctx = makeCtx("user_a", "agent_noisy");
    await callN(tool, ctx, CLIENT_RATE_LIMIT);
    const throttled = await tool.handler({}, ctx);

    expect(throttled.structuredContent?.limit).toBe(CLIENT_RATE_LIMIT);
    expect(throttled.content[0].text).toContain(`${CLIENT_RATE_LIMIT} MCP tool calls`);
  });
});

describe("throttled response contract", () => {
  it("includes retry_after_seconds and a correlation ID in body and text", async () => {
    const tool = buildTool();
    const ctx = makeCtx("user_a", "agent_noisy");
    await callN(tool, ctx, CLIENT_RATE_LIMIT);
    const throttled = await tool.handler({}, ctx);

    const correlationId = throttled.structuredContent?.correlation_id as string;
    expect(correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(throttled.structuredContent?.retry_after_seconds).toBe(9);
    expect(throttled.content[0].text).toContain(`Retry after 9s`);
    expect(throttled.content[0].text).toContain(`correlation_id ${correlationId}`);
  });

  it("returns a distinct correlation ID for every throttled call", async () => {
    const tool = buildTool();
    const ctx = makeCtx("user_a", "agent_noisy");
    await callN(tool, ctx, CLIENT_RATE_LIMIT);
    const a = await tool.handler({}, ctx);
    const b = await tool.handler({}, ctx);

    expect(a.structuredContent?.correlation_id).not.toBe(b.structuredContent?.correlation_id);
  });

  it("falls back to the rolling window length when the gate omits retry_after_seconds", async () => {
    const tool = buildTool();
    rpc.mockImplementation(async (fn: string) =>
      fn === "mcp_begin_call"
        ? { data: { allowed: false, reason: "rate_limited", scope: "account" }, error: null }
        : { data: null, error: null },
    );

    const throttled = await tool.handler({}, makeCtx("user_a", null));
    expect(throttled.structuredContent?.retry_after_seconds).toBe(RATE_WINDOW_SECONDS);
    expect(throttled.content[0].text).toContain(`Retry after ${RATE_WINDOW_SECONDS}s`);
  });

  it("never executes the tool handler once throttled, and logs no finish row", async () => {
    const tool = buildTool();
    const ctx = makeCtx("user_a", "agent_noisy");
    await callN(tool, ctx, CLIENT_RATE_LIMIT);
    handlerSpy.mockClear();
    rpc.mockClear();

    await tool.handler({}, ctx);
    expect(handlerSpy).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["mcp_begin_call"]);
  });

  it("omits retry_after_seconds for non-throttle denials such as revoked agents", async () => {
    const tool = buildTool();
    gate.revoke("agent_revoked");
    const denied = await tool.handler({}, makeCtx("user_a", "agent_revoked"));

    expect(denied.isError).toBe(true);
    expect(denied.structuredContent?.retry_after_seconds).toBeUndefined();
    expect(denied.structuredContent?.correlation_id).toEqual(expect.any(String));
    expect(denied.content[0].text).toMatch(/was revoked/);
  });
});

describe("allowed responses", () => {
  it("surfaces remaining account and agent quota alongside the correlation ID", async () => {
    const tool = buildTool();
    const ok = await tool.handler({}, makeCtx("user_a", "agent_calm"));
    const rate = ok.structuredContent?.rate_limit as Record<string, unknown>;

    expect(rate.limit).toBe(RATE_LIMIT);
    expect(rate.remaining).toBe(RATE_LIMIT - 1);
    expect(rate.client_remaining).toBe(CLIENT_RATE_LIMIT - 1);
    expect(rate.client_id).toBe("agent_calm");
    expect(ok.structuredContent?.correlation_id).toEqual(expect.any(String));
  });
});
