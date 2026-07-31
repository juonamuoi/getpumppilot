import { z } from "zod";

import type { TuningLogEntry } from "@/lib/paper-store";

/**
 * Deterministic, plain-English "why this happened" for a mitigation outcome,
 * derived only from the recorded rule change and the stored scope deltas.
 */
export function explainOutcome(e: TuningLogEntry): string {
  const op = e.operator === ">=" ? "≥" : "≤";
  const dir = e.newValue === e.oldValue ? "unchanged" : e.newValue > e.oldValue ? "raised" : "lowered";
  const ruleBit =
    dir === "unchanged"
      ? `${e.ruleLabel} stayed at ${op} ${e.oldValue}${e.unit}`
      : `${e.ruleLabel} was ${dir} from ${op} ${e.oldValue}${e.unit} to ${op} ${e.newValue}${e.unit}`;

  const looser =
    (e.operator === ">=" && e.newValue < e.oldValue) ||
    (e.operator === "<=" && e.newValue > e.oldValue);
  const strictness =
    dir === "unchanged" ? "kept the filter as-is" : looser ? "loosened the filter" : "tightened the filter";

  const mBefore = e.scopeMatchesBefore ?? e.matchesBefore;
  const mAfter = e.scopeMatchesAfter ?? e.matchesAfter;
  const nBefore = e.scopeNearMissBefore ?? e.nearMissBefore;
  const nAfter = e.scopeNearMissAfter ?? e.nearMissAfter;

  const parts: string[] = [`${ruleBit}, which ${strictness}.`];

  if (mBefore != null && mAfter != null) {
    const d = mAfter - mBefore;
    parts.push(
      d === 0
        ? `Expected matches held at ${mAfter}.`
        : `Expected matches went ${d > 0 ? "up" : "down"} ${Math.abs(d)} (${mBefore} → ${mAfter}).`,
    );
  }
  if (nBefore != null && nAfter != null && nBefore !== nAfter) {
    const d = nAfter - nBefore;
    parts.push(
      `${Math.abs(d)} asset${Math.abs(d) === 1 ? "" : "s"} ${d > 0 ? "moved into" : "left"} the near-miss band (${nBefore} → ${nAfter}).`,
    );
  }

  if (!e.outcome) {
    parts.push("Outcome is still pending — no scan has run against the new rules yet.");
    return parts.join(" ");
  }

  const o = e.outcome;
  if (o.status === "alerts-fired") {
    parts.push(
      `${o.matched} asset${o.matched === 1 ? "" : "s"}${o.symbols.length ? ` (${o.symbols.join(", ")})` : ""} cleared every gate, so ${o.delivered} alert${o.delivered === 1 ? "" : "s"} fired${o.channels.length ? ` via ${o.channels.join(", ")}` : ""}.`,
    );
  } else if (o.status === "no-matches") {
    parts.push(
      looser
        ? "Even after loosening, no asset cleared all gates, so nothing was delivered."
        : "The tighter bar left no asset clearing all gates, so nothing was delivered.",
    );
  } else {
    parts.push(
      `${o.matched} asset${o.matched === 1 ? "" : "s"} matched, but every delivery channel is muted, so no alert was sent.`,
    );
  }

  if (e.fragilePct != null) {
    parts.push(
      e.fragilePct >= 60
        ? `Fragility is high (${e.fragilePct.toFixed(0)}%) — small market moves could flip this result.`
        : `Fragility is ${e.fragilePct.toFixed(0)}%, so the result is reasonably stable.`,
    );
  }

  return parts.join(" ");
}

/** Structured, export-friendly slices of the same plain-English explanation. */
export type ExplainFields = {
  why: string;
  whyChange: string;
  whyStrictness: string;
  whyImpact: string;
  whyOutcome: string;
  whyFragility: string;
};

export function explainFields(e: TuningLogEntry): ExplainFields {
  const op = e.operator === ">=" ? "≥" : "≤";
  const dir = e.newValue === e.oldValue ? "unchanged" : e.newValue > e.oldValue ? "raised" : "lowered";
  const looser =
    (e.operator === ">=" && e.newValue < e.oldValue) ||
    (e.operator === "<=" && e.newValue > e.oldValue);

  const mBefore = e.scopeMatchesBefore ?? e.matchesBefore;
  const mAfter = e.scopeMatchesAfter ?? e.matchesAfter;
  const nBefore = e.scopeNearMissBefore ?? e.nearMissBefore;
  const nAfter = e.scopeNearMissAfter ?? e.nearMissAfter;

  const impact: string[] = [];
  if (mBefore != null && mAfter != null) {
    const d = mAfter - mBefore;
    impact.push(
      d === 0
        ? `Expected matches held at ${mAfter}.`
        : `Expected matches went ${d > 0 ? "up" : "down"} ${Math.abs(d)} (${mBefore} → ${mAfter}).`,
    );
  }
  if (nBefore != null && nAfter != null && nBefore !== nAfter) {
    const d = nAfter - nBefore;
    impact.push(
      `${Math.abs(d)} asset${Math.abs(d) === 1 ? "" : "s"} ${d > 0 ? "moved into" : "left"} the near-miss band (${nBefore} → ${nAfter}).`,
    );
  }

  const o = e.outcome;
  const outcome = !o
    ? "Outcome is still pending — no scan has run against the new rules yet."
    : o.status === "alerts-fired"
      ? `${o.matched} asset${o.matched === 1 ? "" : "s"}${o.symbols.length ? ` (${o.symbols.join(", ")})` : ""} cleared every gate, so ${o.delivered} alert${o.delivered === 1 ? "" : "s"} fired${o.channels.length ? ` via ${o.channels.join(", ")}` : ""}.`
      : o.status === "no-matches"
        ? looser
          ? "Even after loosening, no asset cleared all gates, so nothing was delivered."
          : "The tighter bar left no asset clearing all gates, so nothing was delivered."
        : `${o.matched} asset${o.matched === 1 ? "" : "s"} matched, but every delivery channel is muted, so no alert was sent.`;

  return {
    why: explainOutcome(e),
    whyChange:
      dir === "unchanged"
        ? `${e.ruleLabel} stayed at ${op} ${e.oldValue}${e.unit}`
        : `${e.ruleLabel} was ${dir} from ${op} ${e.oldValue}${e.unit} to ${op} ${e.newValue}${e.unit}`,
    whyStrictness: dir === "unchanged" ? "unchanged" : looser ? "loosened" : "tightened",
    whyImpact: impact.join(" "),
    whyOutcome: outcome,
    whyFragility:
      e.fragilePct == null
        ? ""
        : e.fragilePct >= 60
          ? `High fragility (${e.fragilePct.toFixed(0)}%) — small market moves could flip this result.`
          : `Fragility ${e.fragilePct.toFixed(0)}% — reasonably stable.`,
  };
}


/* ------------------------------------------------------------------ *
 * Field-sync guard
 *
 * Every UI surface and CSV/JSON exporter that emits "Why" data must use
 * these keys. The typing below breaks the build if a key is added to
 * ExplainFields without being listed here (or vice versa), and
 * assertExplainFieldsComplete() catches drift at runtime.
 * ------------------------------------------------------------------ */

export const EXPLAIN_FIELD_KEYS = [
  "why",
  "whyChange",
  "whyStrictness",
  "whyImpact",
  "whyOutcome",
  "whyFragility",
] as const;

export type ExplainFieldKey = (typeof EXPLAIN_FIELD_KEYS)[number];

// Compile-time: the list and the type must describe exactly the same keys.
type AssertSameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _explainKeysAreExhaustive: AssertSameKeys<ExplainFieldKey, keyof ExplainFields> = true;
void _explainKeysAreExhaustive;

/**
 * Runtime guard: verifies a produced explanation object carries exactly the
 * documented keys with string values. Returns the list of problems (empty when
 * in sync) so callers/tests can surface actionable drift.
 */
export function assertExplainFieldsComplete(fields: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const key of EXPLAIN_FIELD_KEYS) {
    if (!(key in fields)) problems.push(`missing field "${key}"`);
    else if (typeof fields[key] !== "string") problems.push(`field "${key}" is not a string`);
  }
  for (const key of Object.keys(fields)) {
    if (!(EXPLAIN_FIELD_KEYS as readonly string[]).includes(key)) {
      problems.push(`unexpected field "${key}" not declared in ExplainFields`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * Zod runtime validation
 *
 * Catches malformed Why data (missing, non-string, blank or placeholder
 * values) BEFORE it reaches a clipboard copy or a CSV/JSON export.
 * ------------------------------------------------------------------ */

const nonEmpty = (label: string) =>
  z
    .string({ message: `${label} must be a string` })
    .trim()
    .min(1, `${label} is empty`)
    .refine((s) => !/^(undefined|null|NaN)$/i.test(s), `${label} contains a placeholder value`)
    .refine((s) => !/\b(undefined|NaN)\b/.test(s), `${label} contains "undefined"/"NaN"`);

/** Fields that may legitimately be blank (no impact recorded, no fragility). */
const optionalText = (label: string) =>
  z
    .string({ message: `${label} must be a string` })
    .refine((s) => !/\b(undefined|NaN)\b/.test(s), `${label} contains "undefined"/"NaN"`);

export const ExplainFieldsSchema = z
  .object({
    why: nonEmpty("why"),
    whyChange: nonEmpty("whyChange"),
    whyStrictness: z.enum(["loosened", "tightened", "unchanged"], {
      message: "whyStrictness must be loosened, tightened or unchanged",
    }),
    whyImpact: optionalText("whyImpact"),
    whyOutcome: nonEmpty("whyOutcome"),
    whyFragility: optionalText("whyFragility"),
  })
  .strict();

export type ValidatedExplainFields = z.infer<typeof ExplainFieldsSchema>;

export type ExplainValidation = {
  ok: boolean;
  /** Always usable: validated fields, or the raw output when invalid. */
  fields: ExplainFields;
  /** Human-readable problems, e.g. `whyOutcome: whyOutcome is empty`. */
  issues: string[];
};

/** Validates an already-built explanation object. */
export function validateExplainFields(fields: unknown): ExplainValidation {
  const parsed = ExplainFieldsSchema.safeParse(fields);
  if (parsed.success) return { ok: true, fields: parsed.data, issues: [] };
  const issues = parsed.error.issues.map(
    (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
  );
  return { ok: false, fields: fields as ExplainFields, issues };
}

/** Builds and validates an entry's Why explanation in one step. */
export function safeExplainFields(e: TuningLogEntry): ExplainValidation {
  return validateExplainFields(explainFields(e));
}

/* ------------------------------------------------------------------ *
 * Sanitized export
 *
 * Keeps every field that passes validation and replaces only the
 * malformed ones with a clear, greppable marker so a copy/export is
 * never silently wrong and never blocked outright.
 * ------------------------------------------------------------------ */

export const INVALID_FIELD_MARKER = "[invalid]";

export type SanitizedExplain = {
  /** All ExplainFields keys; malformed ones replaced with the marker. */
  fields: Record<ExplainFieldKey, string>;
  /** Keys that were replaced. */
  invalidKeys: ExplainFieldKey[];
  /** Human-readable validation problems (empty when clean). */
  issues: string[];
  /** True when nothing had to be replaced. */
  ok: boolean;
};

/**
 * Field-by-field sanitize: validates each key on its own so one bad value
 * doesn't poison the rest of the explanation.
 */
export function sanitizeExplainFields(fields: unknown): SanitizedExplain {
  const raw = (fields ?? {}) as Record<string, unknown>;
  const shape = ExplainFieldsSchema.shape;
  const out = {} as Record<ExplainFieldKey, string>;
  const invalidKeys: ExplainFieldKey[] = [];
  const issues: string[] = [];

  for (const key of EXPLAIN_FIELD_KEYS) {
    const parsed = shape[key].safeParse(raw[key]);
    if (parsed.success) {
      out[key] = String(parsed.data);
    } else {
      out[key] = INVALID_FIELD_MARKER;
      invalidKeys.push(key);
      parsed.error.issues.forEach((i) => issues.push(`${key}: ${i.message}`));
    }
  }
  for (const key of Object.keys(raw)) {
    if (!(EXPLAIN_FIELD_KEYS as readonly string[]).includes(key)) {
      issues.push(`(root): unexpected field "${key}" dropped from sanitized export`);
    }
  }

  return { fields: out, invalidKeys, issues, ok: invalidKeys.length === 0 };
}

/** Builds and sanitizes an entry's Why explanation in one step. */
export function sanitizedExplainFields(e: TuningLogEntry): SanitizedExplain {
  return sanitizeExplainFields(explainFields(e));
}

