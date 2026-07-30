import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Storage-audit instrumentation regression suite.
 *
 * Verifies that every private-bucket access attempt is recorded correctly:
 *  - owner-folder parsing / ownership checks cannot be spoofed by path tricks,
 *  - rows carry the per-request correlation id (`scanId#requestId`) so a single
 *    attempt can be traced end-to-end,
 *  - untrusted strings are truncated to the stored column widths,
 *  - denials and owner mismatches trigger the alert detector (throttled),
 *  - auditing is best-effort and never throws into the user-facing operation.
 */

const insert = vi.fn(async () => ({ error: null }));
const rpc = vi.fn(async () => ({ error: null }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({ insert }),
    rpc,
  },
}));

const { logStorageAccess, ownsPath, pathOwner } = await import("@/lib/storage-audit.server");
const { runWithRequestId, sanitizeRequestId, traceId } = await import(
  "@/lib/request-context.server"
);

const OWNER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

const lastRow = () => insert.mock.calls.at(-1)?.[0] as Record<string, unknown>;

/** Advance past the 60s alert-evaluation throttle inside the module. */
const unthrottle = () => vi.setSystemTime(new Date(Date.now() + 120_000));

describe("owner-folder resolution", () => {
  it("reads the owner uuid from the first path segment", () => {
    expect(pathOwner(`${OWNER}/reports/a.pdf`)).toBe(OWNER);
  });

  it("returns null when the first segment is not a uuid", () => {
    expect(pathOwner("public/a.pdf")).toBeNull();
    expect(pathOwner(`reports/${OWNER}/a.pdf`)).toBeNull();
    expect(pathOwner("")).toBeNull();
  });

  it("only treats the caller as owner when the folder uuid matches exactly", () => {
    expect(ownsPath(OWNER, `${OWNER}/a.pdf`)).toBe(true);
    expect(ownsPath(OTHER, `${OWNER}/a.pdf`)).toBe(false);
    expect(ownsPath(null, `${OWNER}/a.pdf`)).toBe(false);
    // A uuid appearing later in the path must not grant ownership.
    expect(ownsPath(OWNER, `${OTHER}/${OWNER}/a.pdf`)).toBe(false);
  });
});

describe("audit row writes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T11:00:00Z"));
    insert.mockClear();
    rpc.mockClear();
    insert.mockImplementation(async () => ({ error: null }));
  });

  it("records the acting user, path owner and decision for an allowed read", async () => {
    await logStorageAccess({
      userId: OWNER,
      bucket: "threat-reports",
      objectPath: `${OWNER}/scan-1.pdf`,
      operation: "download",
      decision: "allow",
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(lastRow()).toMatchObject({
      user_id: OWNER,
      bucket: "threat-reports",
      object_path: `${OWNER}/scan-1.pdf`,
      operation: "download",
      decision: "allow",
      path_owner_id: OWNER,
    });
  });

  it("stamps the row with scanId#requestId inside a request scope", async () => {
    await runWithRequestId("req_test123456", async () => {
      await logStorageAccess({
        userId: OWNER,
        bucket: "threat-reports",
        objectPath: `${OWNER}/scan-1.pdf`,
        operation: "sign",
        decision: "allow",
        correlationId: "scan_abc",
      });
    });

    expect(lastRow().correlation_id).toBe("scan_abc#req_test123456");
  });

  it("falls back to the request id alone when there is no domain id", async () => {
    await runWithRequestId("req_test123456", async () => {
      await logStorageAccess({
        userId: OWNER,
        bucket: "threat-reports",
        objectPath: `${OWNER}/scan-1.pdf`,
        operation: "sign",
        decision: "allow",
      });
    });

    expect(lastRow().correlation_id).toBe("req_test123456");
  });

  it("truncates untrusted values to the stored column widths", async () => {
    await logStorageAccess({
      userId: OWNER,
      bucket: "b".repeat(200),
      objectPath: `${OWNER}/${"p".repeat(900)}`,
      operation: "upload",
      decision: "deny",
      reason: "r".repeat(500),
      correlationId: "c".repeat(300),
    });

    const row = lastRow();
    expect((row.bucket as string).length).toBe(64);
    expect((row.object_path as string).length).toBe(512);
    expect((row.reason as string).length).toBe(200);
    expect((row.correlation_id as string).length).toBeLessThanOrEqual(64);
  });
});

describe("alert detection triggers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00Z"));
    insert.mockClear();
    rpc.mockClear();
    insert.mockImplementation(async () => ({ error: null }));
  });

  it("evaluates alerts after a denial", async () => {
    unthrottle();
    await logStorageAccess({
      userId: OTHER,
      bucket: "threat-reports",
      objectPath: `${OWNER}/scan-1.pdf`,
      operation: "download",
      decision: "deny",
      reason: "not_owner",
    });

    expect(rpc).toHaveBeenCalledWith("evaluate_storage_audit_alerts", {
      _window_minutes: 15,
      _deny_threshold: 10,
      _mismatch_threshold: 3,
    });
  });

  it("evaluates alerts on an owner mismatch even when the op was allowed", async () => {
    unthrottle();
    await logStorageAccess({
      userId: OTHER,
      bucket: "threat-reports",
      objectPath: `${OWNER}/scan-1.pdf`,
      operation: "sign",
      decision: "allow",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not evaluate alerts for ordinary owner-matched allows", async () => {
    unthrottle();
    await logStorageAccess({
      userId: OWNER,
      bucket: "threat-reports",
      objectPath: `${OWNER}/scan-1.pdf`,
      operation: "download",
      decision: "allow",
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("throttles repeated evaluations to at most one per minute", async () => {
    unthrottle();
    const deny = () =>
      logStorageAccess({
        userId: OTHER,
        bucket: "threat-reports",
        objectPath: `${OWNER}/scan-1.pdf`,
        operation: "download",
        decision: "deny",
      });

    await deny();
    await deny();
    await deny();
    expect(rpc).toHaveBeenCalledTimes(1);
    // ...but every attempt is still written to the append-only trail.
    expect(insert).toHaveBeenCalledTimes(3);
  });
});

describe("best-effort behaviour", () => {
  beforeEach(() => {
    insert.mockClear();
    rpc.mockClear();
  });

  it("never throws when the audit insert fails", async () => {
    insert.mockImplementationOnce(async () => {
      throw new Error("db down");
    });

    await expect(
      logStorageAccess({
        userId: OWNER,
        bucket: "threat-reports",
        objectPath: `${OWNER}/scan-1.pdf`,
        operation: "upload",
        decision: "allow",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("request correlation ids", () => {
  it("rejects caller-supplied ids that are unsafe to log or store", () => {
    expect(sanitizeRequestId("req_abc123")).toBe("req_abc123");
    expect(sanitizeRequestId("short")).toBeNull();
    expect(sanitizeRequestId("bad id/../etc")).toBeNull();
    expect(sanitizeRequestId("<script>alert(1)</script>")).toBeNull();
    expect(sanitizeRequestId("x".repeat(65))).toBeNull();
    expect(sanitizeRequestId(null)).toBeNull();
  });

  it("returns the domain id alone outside a request scope", () => {
    expect(traceId("scan_abc")).toBe("scan_abc");
    expect(traceId(null)).toBeNull();
  });

  it("keeps request scopes isolated from one another", async () => {
    const a = runWithRequestId("req_aaaaaa", () => traceId("scan_1"));
    const b = runWithRequestId("req_bbbbbb", () => traceId("scan_1"));
    expect(a).toBe("scan_1#req_aaaaaa");
    expect(b).toBe("scan_1#req_bbbbbb");
    expect(traceId("scan_1")).toBe("scan_1");
  });
});
