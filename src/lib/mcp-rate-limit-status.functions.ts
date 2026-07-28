import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StatusInput = z.object({
  clientId: z.string().trim().min(1).max(128).nullable().default(null),
});

export type RateLimitScopeStatus = {
  limit: number;
  used: number;
  remaining: number;
  throttled: boolean;
  retryAfterSeconds: number;
  nextRetryAt: string;
};

export type RateLimitStatus = {
  plan: string | null;
  windowSeconds: number;
  checkedAt: string;
  account: RateLimitScopeStatus;
  client: (RateLimitScopeStatus & { clientId: string; revoked: boolean }) | null;
  retryAfterSeconds: number;
  nextRetryAt: string;
};

const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

export function normalizeRateLimitStatus(raw: unknown): RateLimitStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const scope = (value: unknown): RateLimitScopeStatus => {
    const s = (value ?? {}) as Record<string, unknown>;
    return {
      limit: num(s.limit),
      used: num(s.used),
      remaining: num(s.remaining),
      throttled: Boolean(s.throttled),
      retryAfterSeconds: num(s.retry_after_seconds),
      nextRetryAt: str(s.next_retry_at, now),
    };
  };

  const clientRaw = r.client as Record<string, unknown> | null | undefined;
  return {
    plan: typeof r.plan === "string" ? r.plan : null,
    windowSeconds: num(r.window_seconds, 60),
    checkedAt: str(r.checked_at, now),
    account: scope(r.account),
    client: clientRaw
      ? {
          ...scope(clientRaw),
          clientId: str(clientRaw.client_id, "unknown"),
          revoked: Boolean(clientRaw.revoked),
        }
      : null,
    retryAfterSeconds: num(r.retry_after_seconds),
    nextRetryAt: str(r.next_retry_at, now),
  };
}

/**
 * Read-only quota check: returns account-wide and per-agent remaining calls plus
 * the next retry time. It does NOT consume quota and writes no audit row.
 */
export const getMcpRateLimitStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StatusInput.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<RateLimitStatus> => {
    const { data: raw, error } = await context.supabase.rpc("mcp_rate_limit_status", {
      _user_id: context.userId,
      _client_id: data.clientId ?? undefined,
    });
    if (error) throw new Error(error.message);

    const parsed = (raw ?? {}) as Record<string, unknown>;
    if (typeof parsed.error === "string") throw new Error(`Rate limit status: ${parsed.error}`);
    return normalizeRateLimitStatus(parsed);
  });
