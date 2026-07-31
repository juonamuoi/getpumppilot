import { beforeEach, describe, expect, it } from "vitest";

import {
  NO_SYMBOL,
  clearValidationNotes,
  getValidationNotes,
  notesByField,
  notesBySymbol,
  recordValidationNote,
} from "@/lib/explain-validation-log";
import type { TuningLogEntry } from "@/lib/paper-store";

const entry = (over: Partial<TuningLogEntry> = {}) =>
  ({
    id: "t1",
    ts: Date.parse("2026-01-02T03:04:05Z"),
    ruleLabel: "Momentum score",
    correlationId: "corr-1",
    outcome: { symbols: ["SOL", "PEPE"] },
    ...over,
  }) as unknown as TuningLogEntry;

describe("explain validation notes", () => {
  beforeEach(() => clearValidationNotes());

  it("records a note with symbols, fields and timestamps", () => {
    const note = recordValidationNote(entry(), "copy", ["whyOutcome: whyOutcome is empty"]);
    expect(note.symbols).toEqual(["SOL", "PEPE"]);
    expect(note.invalidFields).toEqual(["whyOutcome"]);
    expect(note.entryTs).toBe(Date.parse("2026-01-02T03:04:05Z"));
    expect(getValidationNotes()).toHaveLength(1);
  });

  it("buckets entries without outcome symbols", () => {
    const note = recordValidationNote(entry({ outcome: undefined }), "export", ["why: why is empty"]);
    expect(note.symbols).toEqual([NO_SYMBOL]);
  });

  it("collapses repeat failures for the same entry, source and fields", () => {
    recordValidationNote(entry(), "copy", ["why: why is empty"], ["why"]);
    recordValidationNote(entry(), "copy", ["why: why is empty"], ["why"]);
    expect(getValidationNotes()).toHaveLength(1);
  });

  it("keeps separate notes per source and per field set", () => {
    recordValidationNote(entry(), "copy", ["why: why is empty"], ["why"]);
    recordValidationNote(entry(), "export", ["why: why is empty"], ["why"]);
    recordValidationNote(entry(), "copy", ["whyChange: is empty"], ["whyChange"]);
    expect(getValidationNotes()).toHaveLength(3);
  });

  it("groups recurring failures by symbol and by field", () => {
    recordValidationNote(entry(), "copy", ["why: why is empty"], ["why"]);
    recordValidationNote(entry({ id: "t2", outcome: { symbols: ["SOL"] } } as never), "export", [
      "whyOutcome: is empty",
    ], ["whyOutcome"]);

    const symbols = notesBySymbol(getValidationNotes());
    expect(symbols[0].symbol).toBe("SOL");
    expect(symbols[0].notes).toBe(2);
    expect(symbols[0].entries).toBe(2);
    expect(symbols.find((s) => s.symbol === "PEPE")?.notes).toBe(1);

    expect(notesByField(getValidationNotes()).map((f) => f.field).sort()).toEqual([
      "why",
      "whyOutcome",
    ]);
  });
});
