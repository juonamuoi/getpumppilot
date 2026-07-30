import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Admin-only access regression suite for the storage-audit surface.
 *
 * Covers both entry points into the audit trail:
 *  - the `/storage-audit` server functions, which must call `assertAdmin`
 *    with the CALLER's client before any service-role read, and
 *  - `GET /api/storage-audit/export`, which must reject missing/invalid
 *    bearer tokens (401) and signed-in non-admins (403) before touching data.
 */

const createClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { assertAdmin } = await import("@/lib/admin-guard");
const { authorizeAdmin, parseExportQuery, csvRow, csvHeader } = await import(
  "@/lib/storage-audit-export.server"
);

const ADMIN = "aaaaaaaa-1111-2222-3333-444444444444";
const USER = "bbbbbbbb-1111-2222-3333-444444444444";

type RpcResult = { data: boolean | null; error: unknown };

function callerClient(user: { id: string } | null, role: RpcResult) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: "bad" } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe("has_role");
      expect(args).toMatchObject({ _role: "admin" });
      return role;
    },
  };
}

describe("assertAdmin (server functions)", () => {
  it("allows a caller whose has_role check returns true", async () => {
    await expect(
      assertAdmin(callerClient({ id: ADMIN }, { data: true, error: null }) as never, ADMIN),
    ).resolves.toBeUndefined();
  });

  it("denies a signed-in non-admin", async () => {
    await expect(
      assertAdmin(callerClient({ id: USER }, { data: false, error: null }) as never, USER),
    ).rejects.toThrow(/admin role required/i);
  });

  it("denies when the role lookup errors or returns null (fail closed)", async () => {
    await expect(
      assertAdmin(callerClient({ id: USER }, { data: null, error: null }) as never, USER),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      assertAdmin(
        callerClient({ id: USER }, { data: true, error: { message: "rls" } }) as never,
        USER,
      ),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("every storage-audit server function is admin-gated", () => {
  const source = readFileSync("src/lib/storage-audit.functions.ts", "utf8");
  const handlers = source.split(".handler(").slice(1);

  it("has handlers to check", () => {
    expect(handlers.length).toBeGreaterThan(0);
  });

  it("calls assertAdmin before importing the service-role client", () => {
    for (const body of handlers) {
      const guard = body.indexOf("assertAdmin(");
      const admin = body.indexOf("client.server");
      expect(guard, "handler must call assertAdmin").toBeGreaterThan(-1);
      if (admin > -1) expect(guard).toBeLessThan(admin);
    }
  });

  it("requires an authenticated session on every server function", () => {
    const fns = source.split("createServerFn(").slice(1);
    for (const fn of fns) expect(fn).toContain("requireSupabaseAuth");
  });

  it("keeps the admin dashboard out of search indexes", () => {
    const route = readFileSync("src/routes/storage-audit.tsx", "utf8");
    expect(route).toMatch(/noindex/);
  });
});

describe("GET /api/storage-audit/export authorization", () => {
  beforeEach(() => {
    createClient.mockReset();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  });

  const req = (headers: Record<string, string> = {}) =>
    new Request("https://app.test/api/storage-audit/export", { headers });

  it("rejects a request with no Authorization header", async () => {
    const result = await authorizeAdmin(req());
    expect(result).toMatchObject({ ok: false, status: 401, error: "missing_bearer_token" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a non-bearer Authorization header", async () => {
    const result = await authorizeAdmin(req({ authorization: "Basic abc123" }));
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired bearer token", async () => {
    createClient.mockReturnValue(callerClient(null, { data: null, error: null }));
    const result = await authorizeAdmin(req({ authorization: "Bearer expired.token" }));
    expect(result).toMatchObject({ ok: false, status: 401, error: "invalid_token" });
  });

  it("rejects a valid session that lacks the admin role", async () => {
    createClient.mockReturnValue(callerClient({ id: USER }, { data: false, error: null }));
    const result = await authorizeAdmin(req({ authorization: "Bearer user.token" }));
    expect(result).toMatchObject({ ok: false, status: 403, error: "admin_role_required" });
  });

  it("fails closed when the role lookup errors", async () => {
    createClient.mockReturnValue(
      callerClient({ id: USER }, { data: true, error: { message: "denied" } }),
    );
    const result = await authorizeAdmin(req({ authorization: "Bearer user.token" }));
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("authorizes an admin and reports the caller id", async () => {
    createClient.mockReturnValue(callerClient({ id: ADMIN }, { data: true, error: null }));
    const result = await authorizeAdmin(req({ authorization: "Bearer admin.token" }));
    expect(result).toEqual({ ok: true, userId: ADMIN });
  });

  it("verifies the role with the caller's own client, never the service role", async () => {
    createClient.mockReturnValue(callerClient({ id: ADMIN }, { data: true, error: null }));
    await authorizeAdmin(req({ authorization: "Bearer admin.token" }));
    const [, key] = createClient.mock.calls[0] as [string, string];
    expect(key).toBe("sb_publishable_test");
    expect(key).not.toMatch(/service|secret/i);
  });

  it("reports a configuration problem rather than skipping the check", async () => {
    delete process.env.SUPABASE_URL;
    const result = await authorizeAdmin(req({ authorization: "Bearer admin.token" }));
    expect(result).toMatchObject({ ok: false, status: 500 });
    process.env.SUPABASE_URL = "https://example.supabase.co";
  });
});

describe("export query hardening", () => {
  const parse = (qs: string) =>
    parseExportQuery(new URL(`https://app.test/api/storage-audit/export?${qs}`));

  it("bounds every numeric parameter", () => {
    const big = parse("hours=99999&limit=999999&pageSize=99999&offset=-5");
    expect(big.hours).toBe(720);
    expect(big.limit).toBe(50_000);
    expect(big.pageSize).toBe(1000);
    expect(big.offset).toBe(0);
  });

  it("falls back to safe defaults for junk input", () => {
    const junk = parse("hours=abc&decision=everything&format=xml");
    expect(junk.hours).toBe(24);
    expect(junk.decision).toBe("all");
    expect(junk.format).toBe("csv");
  });

  it("truncates free-text filters", () => {
    const long = parse(`q=${"z".repeat(500)}&bucket=${"b".repeat(200)}`);
    expect(long.q.length).toBe(120);
    expect(long.bucket.length).toBe(64);
  });

  it("escapes CSV cells so exported values cannot break the row shape", () => {
    const row = {
      id: "1",
      created_at: "2026-07-30T11:00:00Z",
      user_id: USER,
      bucket: "threat-reports",
      object_path: 'a,b"c\nd',
      operation: "download",
      decision: "deny",
      reason: null,
      path_owner_id: ADMIN,
      correlation_id: "scan#req",
    };
    const line = csvRow(row as never);
    expect(csvHeader().trim().split(",")).toHaveLength(10);
    expect(line).toContain('"a,b""c\nd"');
    expect(line.endsWith("\n")).toBe(true);
  });
});
