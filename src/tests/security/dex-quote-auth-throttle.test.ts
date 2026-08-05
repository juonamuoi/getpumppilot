import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Integration coverage for the paid DEX quote endpoint.
 *
 * The upstream 0x key is metered, so two guarantees must hold together:
 *  1. every call passes through `requireSupabaseAuth` (no anonymous quoting), and
 *  2. an authenticated caller is throttled per user, even when requests arrive
 *     concurrently rather than one at a time.
 *
 * The auth middleware is exercised for real (its `.server` phase) with the
 * request and Supabase client stubbed, and the throttle is exercised against
 * the real sliding-window implementation.
 */

const getRequestMock = vi.fn();
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => getRequestMock(),
}));

const getClaims = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims: (t: string) => getClaims(t) } }),
}));

const { requireSupabaseAuth } = await import("@/integrations/supabase/auth-middleware");
const { checkQuoteRateLimit } = await import("@/lib/quote-rate-limit.server");

type MiddlewareOptions = { server: (ctx: { next: (arg?: unknown) => unknown }) => Promise<unknown> };
const runAuth = (requireSupabaseAuth as unknown as { options: MiddlewareOptions }).options.server;

const JWT = "aaa.bbb.ccc";

function requestWith(headers: Record<string, string>) {
  return { headers: new Headers(headers) };
}

/** Runs the middleware and returns the context it would hand to the handler. */
async function authenticate(headers: Record<string, string>) {
  getRequestMock.mockReturnValue(requestWith(headers));
  const next = vi.fn((arg?: unknown) => arg);
  const result = (await runAuth({ next })) as { context?: { userId?: string } } | undefined;
  return result?.context;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["SUPABASE_URL"] = "https://example.supabase.co";
  process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test";
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-a" } }, error: null });
});

describe("DEX quote endpoint — authentication", () => {
  it("is declared behind requireSupabaseAuth in source", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/dex.functions.ts"), "utf8");
    const quoteDecl = source.slice(source.indexOf("export const getSwapQuote"));
    const chain = quoteDecl.slice(0, quoteDecl.indexOf(".handler"));
    expect(chain).toContain("requireSupabaseAuth");
  });

  it("rejects a request with no authorization header", async () => {
    await expect(authenticate({})).rejects.toThrow(/Unauthorized/);
  });

  it("rejects a non-bearer authorization scheme", async () => {
    await expect(authenticate({ authorization: `Basic ${JWT}` })).rejects.toThrow(/Unauthorized/);
  });

  it("rejects a bearer value that is not a JWT", async () => {
    await expect(authenticate({ authorization: "Bearer not-a-jwt" })).rejects.toThrow(
      /Unauthorized/,
    );
  });

  it("rejects a token the auth server does not accept", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "bad token" } });
    await expect(authenticate({ authorization: `Bearer ${JWT}` })).rejects.toThrow(/Unauthorized/);
  });

  it("never calls the upstream aggregator when auth fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(authenticate({})).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("passes the caller's user id through for a valid token", async () => {
    const context = await authenticate({ authorization: `Bearer ${JWT}` });
    expect(context?.userId).toBe("user-a");
  });
});

describe("DEX quote endpoint — per-user rate limiting under concurrency", () => {
  /** Mirrors the handler's guard: throttled callers get an error, not a quote. */
  async function quoteAttempt(userId: string) {
    await Promise.resolve();
    const verdict = checkQuoteRateLimit(userId);
    if (!verdict.allowed) {
      return { ok: false as const, retryAfterSeconds: verdict.retryAfterSeconds };
    }
    return { ok: true as const };
  }

  it("admits at most the window budget when 100 requests race for one user", async () => {
    const user = `race-${crypto.randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 100 }, () => quoteAttempt(user)),
    );

    const allowed = results.filter((r) => r.ok).length;
    expect(allowed).toBe(20);
    expect(results.length - allowed).toBe(80);
  });

  it("returns a positive retry hint on every throttled concurrent request", async () => {
    const user = `retry-${crypto.randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 40 }, () => quoteAttempt(user)));
    const blocked = results.filter((r) => !r.ok);

    expect(blocked.length).toBeGreaterThan(0);
    for (const r of blocked) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.retryAfterSeconds).toBeGreaterThan(0);
        expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
      }
    }
  });

  it("keeps budgets isolated: one user's flood never throttles another", async () => {
    const noisy = `noisy-${crypto.randomUUID()}`;
    const quiet = `quiet-${crypto.randomUUID()}`;

    const interleaved = Array.from({ length: 60 }, (_, i) =>
      quoteAttempt(i % 3 === 0 && i < 15 ? quiet : noisy),
    );
    const results = await Promise.all(interleaved);

    // The quiet caller made 5 requests; all must be served.
    const quietAttempts = results.filter((_, i) => i % 3 === 0 && i < 15);
    expect(quietAttempts).toHaveLength(5);
    expect(quietAttempts.every((r) => r.ok)).toBe(true);

    // The noisy caller is capped regardless.
    const noisyAllowed = results.filter((r, i) => r.ok && !(i % 3 === 0 && i < 15)).length;
    expect(noisyAllowed).toBe(20);
  });

  it("stays closed for a user already over budget when a second burst arrives", async () => {
    const user = `burst-${crypto.randomUUID()}`;
    await Promise.all(Array.from({ length: 25 }, () => quoteAttempt(user)));

    const second = await Promise.all(Array.from({ length: 10 }, () => quoteAttempt(user)));
    expect(second.every((r) => !r.ok)).toBe(true);
  });
});
