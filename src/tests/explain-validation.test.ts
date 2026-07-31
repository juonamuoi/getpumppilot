import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXPLAIN_FIELD_KEYS,
  ExplainFieldsSchema,
  INVALID_FIELD_MARKER,
  explainFields,
  safeExplainFields,
  sanitizeExplainFields,
  sanitizedExplainFields,
  validateExplainFields,
} from "@/lib/mitigation-explain";
import type { TuningLogEntry } from "@/lib/paper-store";

/** A well-formed tuning log row — produces a clean Why explanation. */
const goodEntry = {
  id: "t1",
  ts: Date.parse("2026-01-02T03:04:05Z"),
  ruleId: "momentum",
  ruleLabel: "Momentum score",
  operator: ">=",
  oldValue: 70,
  newValue: 62,
  unit: "",
  matchesBefore: 3,
  matchesAfter: 6,
  nearMissBefore: 4,
  nearMissAfter: 2,
  fragilePct: 71,
  correlationId: "corr-1",
} as unknown as TuningLogEntry;

/**
 * A corrupted row: missing rule label and non-numeric thresholds, which leaks
 * "undefined"/"NaN" into the derived Why text.
 */
const badEntry = {
  ...goodEntry,
  id: "t2",
  ruleLabel: undefined,
  oldValue: Number.NaN,
  newValue: Number.NaN,
  unit: undefined,
} as unknown as TuningLogEntry;

const cleanFields = () => explainFields(goodEntry);

describe("ExplainFieldsSchema", () => {
  it("accepts a well-formed explanation", () => {
    const parsed = ExplainFieldsSchema.safeParse(cleanFields());
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { whyOutcome: _drop, ...rest } = cleanFields();
    const parsed = ExplainFieldsSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it("rejects non-string values", () => {
    const parsed = ExplainFieldsSchema.safeParse({ ...cleanFields(), why: 42 });
    expect(parsed.success).toBe(false);
  });

  it("rejects blank required text", () => {
    const parsed = ExplainFieldsSchema.safeParse({ ...cleanFields(), whyChange: "   " });
    expect(parsed.success).toBe(false);
  });

  it.each(["undefined", "null", "NaN"])("rejects the placeholder value %s", (v) => {
    expect(ExplainFieldsSchema.safeParse({ ...cleanFields(), why: v }).success).toBe(false);
  });

  it("rejects embedded undefined/NaN in optional text", () => {
    expect(
      ExplainFieldsSchema.safeParse({ ...cleanFields(), whyImpact: "Matches went up NaN (3 → 6)." })
        .success,
    ).toBe(false);
  });

  it("allows optional fields to be empty", () => {
    const parsed = ExplainFieldsSchema.safeParse({
      ...cleanFields(),
      whyImpact: "",
      whyFragility: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("constrains whyStrictness to the known vocabulary", () => {
    expect(ExplainFieldsSchema.safeParse({ ...cleanFields(), whyStrictness: "looser" }).success).toBe(
      false,
    );
    for (const v of ["loosened", "tightened", "unchanged"]) {
      expect(ExplainFieldsSchema.safeParse({ ...cleanFields(), whyStrictness: v }).success).toBe(true);
    }
  });

  it("rejects unexpected extra fields (strict object)", () => {
    const parsed = ExplainFieldsSchema.safeParse({ ...cleanFields(), whyExtra: "nope" });
    expect(parsed.success).toBe(false);
  });
});

describe("safeExplainFields / validateExplainFields", () => {
  it("marks a healthy entry as ok with no issues", () => {
    const res = safeExplainFields(goodEntry);
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.fields.whyOutcome.length).toBeGreaterThan(0);
  });

  it("flags a corrupted entry and reports path-prefixed issues", () => {
    const res = safeExplainFields(badEntry);
    expect(res.ok).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
    for (const issue of res.issues) expect(issue).toMatch(/^[a-zA-Z()]+.*: .+/);
  });

  it("still returns usable raw fields when invalid so the UI can render them", () => {
    const res = safeExplainFields(badEntry);
    expect(Object.keys(res.fields).sort()).toEqual([...EXPLAIN_FIELD_KEYS].sort());
  });

  it("validates arbitrary objects, not just built explanations", () => {
    expect(validateExplainFields(null).ok).toBe(false);
    expect(validateExplainFields({}).ok).toBe(false);
    expect(validateExplainFields(cleanFields()).ok).toBe(true);
  });
});

describe("sanitizeExplainFields", () => {
  it("passes clean data through untouched", () => {
    const res = sanitizedExplainFields(goodEntry);
    expect(res.ok).toBe(true);
    expect(res.invalidKeys).toEqual([]);
    expect(res.fields).toEqual(cleanFields());
  });

  it("replaces only the malformed fields with the marker", () => {
    const res = sanitizeExplainFields({ ...cleanFields(), whyOutcome: "  ", why: undefined });
    expect(res.ok).toBe(false);
    expect(res.invalidKeys.sort()).toEqual(["why", "whyOutcome"]);
    expect(res.fields.why).toBe(INVALID_FIELD_MARKER);
    expect(res.fields.whyOutcome).toBe(INVALID_FIELD_MARKER);
    expect(res.fields.whyChange).toBe(cleanFields().whyChange);
  });

  it("always emits every declared key", () => {
    const res = sanitizeExplainFields({});
    expect(Object.keys(res.fields).sort()).toEqual([...EXPLAIN_FIELD_KEYS].sort());
    expect(res.invalidKeys.sort()).toEqual([...EXPLAIN_FIELD_KEYS].sort());
    expect(Object.values(res.fields).every((v) => v === INVALID_FIELD_MARKER)).toBe(true);
  });

  it("drops unexpected fields and records why", () => {
    const res = sanitizeExplainFields({ ...cleanFields(), rogue: "x" });
    expect(Object.keys(res.fields)).not.toContain("rogue");
    expect(res.issues.join(" ")).toContain("rogue");
  });

  it("never emits undefined/NaN placeholders for a corrupted entry", () => {
    const res = sanitizedExplainFields(badEntry);
    expect(res.ok).toBe(false);
    for (const v of Object.values(res.fields)) {
      if (v === INVALID_FIELD_MARKER) continue;
      expect(v).not.toMatch(/\b(undefined|NaN)\b/);
    }
  });
});

/**
 * Guard rails: the copy and export surfaces must run validation before any
 * clipboard write or file download, so malformed Why data can never ship
 * unmarked.
 */
describe("copy and export paths are gated on validation", () => {
  const read = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");

  it("the audit trail copy button blocks on invalid data and offers a sanitized copy", () => {
    const src = read("src/components/mitigation-audit-trail.tsx");
    expect(src).toContain("safeExplainFields");
    expect(src).toContain("sanitizedExplainFields");
    // Bails out before touching the clipboard when invalid and not sanitized.
    expect(src).toMatch(/if\s*\(!ok\s*&&\s*!sanitized\)/);
    expect(src).toContain("Copy sanitized");
    const guardIdx = src.indexOf("if (!ok && !sanitized)");
    const clipIdx = src.indexOf("clipboard.writeText");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(clipIdx).toBeGreaterThan(guardIdx);
  });

  it("the entry JSON copy carries the validation verdict and sanitized fields", () => {
    const src = read("src/components/mitigation-audit-trail.tsx");
    expect(src).toContain("whyValidation");
    expect(src).toContain("whySanitized");
    expect(src).toContain("INVALID_FIELD_MARKER");
  });

  it("the bulk export exposes a sanitized mode with an invalid-field column", () => {
    const src = read("src/components/mitigation-bulk-export.tsx");
    expect(src).toContain("sanitizedExplainFields");
    expect(src).toContain("whyInvalidFields");
    expect(src).toContain("sanitizedMarker");
  });
});
