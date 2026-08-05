/**
 * Verifies the dev-only snapshot invariant:
 * - warns when a getter allocates a fresh, structurally identical value per call
 * - stays silent for stable getters, primitives, and genuine data changes
 * - compiles away to a passthrough outside development (no warnings in prod)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Invariant = typeof import("@/lib/snapshot-invariant");

async function loadInvariant(dev: boolean): Promise<Invariant> {
  vi.resetModules();
  vi.stubEnv("DEV", dev);
  vi.stubEnv("PROD", !dev);
  vi.stubEnv("MODE", dev ? "development" : "production");
  return import("@/lib/snapshot-invariant");
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function warnings() {
  return warn.mock.calls.map((call) => String(call[0]));
}

describe("checkSnapshotStability in development", () => {
  it("warns when the getter returns a new array reference every call", async () => {
    const { checkSnapshotStability } = await loadInvariant(true);
    const unstable = () => [] as string[];

    checkSnapshotStability(unstable, "demo-store-empty");

    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('store "demo-store-empty"');
  });

  it("names the unstable path and source frame in the warning", async () => {
    const { checkSnapshotStability } = await loadInvariant(true);
    const rules = [{ id: "a" }];
    const events: string[] = [];
    const unstable = () => ({ rules, events, ready: true });

    checkSnapshotStability(unstable, "demo-store-object");

    const message = warnings()[0];
    expect(message).toContain("unstable path:");
    expect(message).toContain("source:");
    expect(message).toContain("snapshot-invariant.test");
  });

  it("returns the first snapshot value it read", async () => {
    const { checkSnapshotStability } = await loadInvariant(true);
    const first = { n: 1 };
    const values = [first, { n: 1 }];
    let i = 0;

    const result = checkSnapshotStability(() => values[i++]!, "demo-returns");

    expect(result).toBe(first);
  });

  it("stays silent for a cached, referentially stable getter", async () => {
    const { checkSnapshotStability } = await loadInvariant(true);
    const EMPTY: string[] = [];

    checkSnapshotStability(() => EMPTY, "demo-stable");

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent for primitive snapshots", async () => {
    const { checkSnapshotStability } = await loadInvariant(true);

    checkSnapshotStability(() => 42, "demo-number");
    checkSnapshotStability(() => "idle", "demo-string");
    checkSnapshotStability(() => null, "demo-null");

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent when the contents genuinely differ between calls", async () => {
    const { checkSnapshotStability } = await loadInvariant(true);
    const values = [{ n: 1 }, { n: 2 }];
    let i = 0;

    checkSnapshotStability(() => values[i++]!, "demo-changing");

    expect(warn).not.toHaveBeenCalled();
  });

  it("deduplicates repeat warnings from the same store and call site", async () => {
    const { checkSnapshotStability } = await loadInvariant(true);
    const unstable = () => ({ items: [] as string[] });

    for (let i = 0; i < 5; i += 1) {
      checkSnapshotStability(unstable, "demo-dedupe");
    }

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns separately for different stores", async () => {
    const { checkSnapshotStability } = await loadInvariant(true);

    checkSnapshotStability(() => ({}), "demo-store-a");
    checkSnapshotStability(() => ({}), "demo-store-b");

    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("checkSnapshotStability outside development", () => {
  it("never warns in production builds", async () => {
    const { checkSnapshotStability } = await loadInvariant(false);

    for (let i = 0; i < 5; i += 1) {
      checkSnapshotStability(() => [] as string[], "prod-store");
      checkSnapshotStability(() => ({ a: 1 }), "prod-store-object");
    }

    expect(warn).not.toHaveBeenCalled();
  });

  it("calls the getter exactly once in production", async () => {
    const { checkSnapshotStability } = await loadInvariant(false);
    const getSnapshot = vi.fn(() => [] as string[]);

    const value = checkSnapshotStability(getSnapshot, "prod-single-call");

    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(value).toEqual([]);
  });

  it("calls the getter twice in development to compare references", async () => {
    const { checkSnapshotStability } = await loadInvariant(true);
    const EMPTY: string[] = [];
    const getSnapshot = vi.fn(() => EMPTY);

    checkSnapshotStability(getSnapshot, "dev-double-call");

    expect(getSnapshot).toHaveBeenCalledTimes(2);
  });
});
