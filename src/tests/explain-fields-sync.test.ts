import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXPLAIN_FIELD_KEYS,
  assertExplainFieldsComplete,
  explainFields,
} from "@/lib/mitigation-explain";
import type { TuningLogEntry } from "@/lib/paper-store";

/** Minimal entry shaped like a real tuning log row. */
const entry = {
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

/** Surfaces that render or export Why data and must stay in sync. */
const CONSUMERS = [
  "src/components/mitigation-audit-trail.tsx",
  "src/components/mitigation-decision-export.tsx",
  "src/components/mitigation-bulk-export.tsx",
  "src/components/mitigation-impact-timeline.tsx",
  "src/lib/timeline-export.ts",
];

describe("ExplainFields stay in sync", () => {
  it("produces exactly the declared keys at runtime", () => {
    expect(assertExplainFieldsComplete(explainFields(entry))).toEqual([]);
  });

  it("declares a stable key list", () => {
    expect([...EXPLAIN_FIELD_KEYS]).toEqual([
      "why",
      "whyChange",
      "whyStrictness",
      "whyImpact",
      "whyOutcome",
      "whyFragility",
    ]);
  });

  it.each(CONSUMERS)("%s references every Why field", (file) => {
    const src = readFileSync(resolve(process.cwd(), file), "utf8");
    const missing = EXPLAIN_FIELD_KEYS.filter(
      (k) => k !== "why" && !new RegExp(`\\b${k}\\b`).test(src),
    );
    expect(missing, `${file} is missing Why fields`).toEqual([]);
  });
});
