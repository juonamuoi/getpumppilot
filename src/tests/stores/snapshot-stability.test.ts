import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for "Maximum update depth exceeded".
 *
 * useSyncExternalStore compares snapshots by reference. Any snapshot getter
 * that allocates a fresh value on every call (`() => []`, `() => ({})`) makes
 * React re-render forever. This suite checks both the source shape of every
 * store and the runtime behaviour of the wallet alerts store.
 */

const LIB_DIR = path.resolve(process.cwd(), "src/lib");

function libFiles(): string[] {
  return readdirSync(LIB_DIR)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => path.join(LIB_DIR, f));
}

const CALL_NAMES = ["useSyncExternalStore(", "useStableSyncExternalStore("];

/** Extract the argument list source of every store-subscription call. */
function callArgsFor(source: string, needle: string): string[] {
  const out: string[] = [];
  let idx = source.indexOf(needle);
  while (idx !== -1) {
    let depth = 0;
    let i = idx + needle.length - 1;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(source.slice(idx + needle.length, i));
    idx = source.indexOf(needle, i);
  }
  return out;
}

function callArgs(source: string): string[] {
  return CALL_NAMES.flatMap((n) => callArgsFor(source, n));
}

/** Split a top-level argument list on commas outside brackets/strings. */
function splitArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of args) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim());
}

// `() => []`, `() => ({})`, `() => new Map()` etc. allocate per call.
const FRESH_ALLOCATION =
  /^\(\s*\)\s*=>\s*(\(\s*)?(\[\s*\]|\{\s*\}|new\s+(Map|Set|Date|Array|Object)\b)/;

describe("store snapshots are reference-stable", () => {
  const files = libFiles().filter((f) => {
    const src = readFileSync(f, "utf8");
    return CALL_NAMES.some((n) => src.includes(n));
  });

  it("finds the store modules to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    it(`${rel} never returns a freshly allocated snapshot`, () => {
      const source = readFileSync(file, "utf8");
      for (const call of callArgs(source)) {
        const args = splitArgs(call);
        // args[1] = getSnapshot, args[2] = getServerSnapshot
        for (const arg of args.slice(1)) {
          expect(
            FRESH_ALLOCATION.test(arg),
            `${rel}: snapshot getter \`${arg}\` allocates a new value on every call, ` +
              `which makes useSyncExternalStore loop forever. Hoist a module-level constant.`,
          ).toBe(false);
        }
      }
    });
  }
});

describe("wallet alerts snapshots", () => {
  it("returns identical references across repeated reads", async () => {
    const store = await import("@/lib/wallet-alerts");
    expect(store.getRules()).toBe(store.getRules());
    expect(store.getEvents()).toBe(store.getEvents());
  });

  it("keeps references stable when nothing changed", async () => {
    const store = await import("@/lib/wallet-alerts");
    const rules = store.getRules();
    const events = store.getEvents();
    for (let i = 0; i < 25; i++) {
      expect(store.getRules()).toBe(rules);
      expect(store.getEvents()).toBe(events);
    }
  });
});
