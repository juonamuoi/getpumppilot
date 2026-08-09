import { describe, expect, it } from "vitest";
// @ts-expect-error - plain ESM script without type declarations
import * as allowlistModule from "../../../scripts/security-allowlist.mjs";

const { applyAllowlist, validateAllowlist, loadAllowlist, GATED_FINDING_IDS, ALLOWLIST_PATH } =
  allowlistModule as {
    applyAllowlist: (advisory: string[], allowlist: unknown, now?: Date) => Record<string, unknown>;
    validateAllowlist: (doc: unknown) => { entries: unknown[]; configErrors: string[] };
    loadAllowlist: () => { entries: unknown[]; configErrors: string[] };
    GATED_FINDING_IDS: string[];
    ALLOWLIST_PATH: string;
  };

/**
 * The finding gate hard-fails only on `open_dex_quote` and
 * `SUPA_function_search_path_mutable`. Every other scanner output may be
 * tracked and explained in security/findings-allowlist.json — but the
 * allowlist must never be able to silence a gated finding, and every entry
 * must carry an explanation and an owner.
 */

type Entry = Record<string, unknown>;
type Validation = { entries: unknown[]; configErrors: string[] };

const doc = (allow: Entry[]) => validateAllowlist({ allow }) as Validation;

const valid: Entry = {
  id: "example_advisory",
  match: "advisory message",
  reason: "Reviewed and accepted for the reasons documented here.",
  owner: "platform-security",
};

describe("allowlist configuration", () => {
  it("ships a valid, committed allowlist file", () => {
    const loaded = loadAllowlist() as Validation;
    expect(ALLOWLIST_PATH).toContain("findings-allowlist.json");
    expect(loaded.configErrors).toEqual([]);
  });

  it("accepts a complete entry", () => {
    expect(doc([valid]).configErrors).toEqual([]);
  });

  it("requires a reason and an owner", () => {
    const { configErrors } = doc([{ id: "x", match: "y" }]);
    expect(configErrors.join("\n")).toMatch(/reason/);
    expect(configErrors.join("\n")).toMatch(/owner/);
  });

  it("requires a match or a pattern", () => {
    expect(doc([{ ...valid, match: undefined }]).configErrors.join("\n")).toMatch(/match.*pattern/i);
  });

  it("rejects duplicate ids, bad regexes and bad expiry dates", () => {
    expect(doc([valid, valid]).configErrors.join("\n")).toMatch(/duplicates/);
    expect(
      doc([{ ...valid, match: undefined, pattern: "([" }]).configErrors.join("\n"),
    ).toMatch(/invalid "pattern"/);
    expect(doc([{ ...valid, expires: "soon" }]).configErrors.join("\n")).toMatch(/expires/);
  });

  it("never lets a gated finding be allowlisted", () => {
    for (const id of GATED_FINDING_IDS as string[]) {
      const { configErrors } = doc([{ ...valid, id }]);
      expect(configErrors.join("\n")).toMatch(new RegExp(`${id}`));
      expect(configErrors.join("\n")).toMatch(/never be allowlisted/);
    }
  });
});

describe("advisory triage", () => {
  const list = doc([
    valid,
    {
      id: "regex_entry",
      pattern: "function public\\.\\w+ is still executable",
      reason: "Self-scoped definer functions derive the account from auth.uid().",
      owner: "platform-security",
    },
  ]);

  it("acknowledges matching advisories with reason and owner", () => {
    const result = applyAllowlist(["an advisory message here"], list) as {
      acknowledged: { id: string; reason: string; owner: string }[];
      unacknowledged: string[];
    };
    expect(result.unacknowledged).toEqual([]);
    expect(result.acknowledged[0]).toMatchObject({ id: "example_advisory", owner: "platform-security" });
    expect(result.acknowledged[0].reason.length).toBeGreaterThan(10);
  });

  it("leaves unmatched advisories visible", () => {
    const result = applyAllowlist(["something brand new"], list) as { unacknowledged: string[] };
    expect(result.unacknowledged).toEqual(["something brand new"]);
  });

  it("stops acknowledging once an entry expires", () => {
    const expiring = doc([{ ...valid, expires: "2020-01-01" }]);
    const result = applyAllowlist(["an advisory message here"], expiring) as {
      acknowledged: unknown[];
      unacknowledged: string[];
      expired: { id: string }[];
    };
    expect(result.acknowledged).toEqual([]);
    expect(result.unacknowledged[0]).toMatch(/expired 2020-01-01/);
    expect(result.expired.map((e) => e.id)).toContain("example_advisory");
  });

  it("reports entries that no longer match anything", () => {
    const result = applyAllowlist([], list) as { unusedEntries: string[] };
    expect(result.unusedEntries.sort()).toEqual(["example_advisory", "regex_entry"]);
  });

  it("cannot suppress a gated finding, because gating is evaluated separately", () => {
    const sneaky = doc([
      {
        id: "sneaky",
        pattern: ".*",
        reason: "An entry that tries to match absolutely everything reported.",
        owner: "someone",
      },
    ]);
    const result = applyAllowlist(["anything at all"], sneaky) as { acknowledged: unknown[] };
    // Catch-all entries only affect advisory output; the gated checks never
    // consult the allowlist (see scripts/security-findings-scan.mjs).
    expect(result.acknowledged).toHaveLength(1);
  });
});
