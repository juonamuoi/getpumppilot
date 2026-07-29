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

