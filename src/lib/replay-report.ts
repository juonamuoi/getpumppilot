/* ------------------------------------------------------------------ *
 * Replay report export
 *
 * Serialises one mitigation replay comparison: the inputs (rule
 * parameters of both runs), the stored preview context that the replay
 * reused, the recorded results (alert outcomes), the canonical / robots /
 * redirect crawl checks, and every timestamp involved. Demo data.
 * ------------------------------------------------------------------ */

import type { TuningLogEntry } from "./paper-store";
import { diffSeoSnapshots, seoSnapshot, type SeoSnapshotDiff } from "./mitigation-seo-checks";

export type ReplayReportInput = {
  previousId: string;
  replayId: string;
  previous: TuningLogEntry[];
  replay: TuningLogEntry[];
};

function iso(ts?: number) {
  return ts ? new Date(ts).toISOString() : null;
}

function csvCell(v: unknown) {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvSection(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

function entryRow(e: TuningLogEntry) {
  return {
    id: e.id,
    timestamp: iso(e.ts),
    appliedAt: iso(e.appliedAt),
    revertedAt: iso(e.revertedAt),
    phase: e.phase ?? "applied",
    source: e.source ?? null,
    mitigation: e.mitigation ?? null,
    trigger: e.trigger ?? null,
    rule: e.rule,
    ruleLabel: e.ruleLabel,
    operator: e.operator,
    unit: e.unit,
    oldValue: e.oldValue,
    newValue: e.newValue,
    preset: e.preset,
    window: e.window ?? null,
    scope: e.scope ?? null,
    matchesBefore: e.matchesBefore ?? null,
    matchesAfter: e.matchesAfter ?? null,
    nearMissBefore: e.nearMissBefore ?? null,
    nearMissAfter: e.nearMissAfter ?? null,
    previewId: e.previewId ?? null,
    replayOf: e.replayOf ?? null,
    correlationId: e.correlationId ?? null,
    outcome: e.outcome
      ? {
          timestamp: iso(e.outcome.ts),
          status: e.outcome.status,
          matched: e.outcome.matched,
          delivered: e.outcome.delivered,
          symbols: e.outcome.symbols,
          channels: e.outcome.channels,
        }
      : null,
  };
}

export type ReplayReport = ReturnType<typeof buildReplayReport>;

export function buildReplayReport(input: ReplayReportInput) {
  const { previousId, replayId, previous, replay } = input;
  const prevOutcome = previous.find((e) => e.outcome)?.outcome;
  const nextOutcome = replay.find((e) => e.outcome)?.outcome;
  const previewContext = previous.filter((e) => e.phase === "preview").map(entryRow);
  const seo: SeoSnapshotDiff = diffSeoSnapshots(
    seoSnapshot(prevOutcome?.symbols ?? []),
    seoSnapshot(nextOutcome?.symbols ?? []),
  );

  const rules = [...new Set([...previous, ...replay].map((e) => e.rule))].sort().map((rule) => {
    const b = previous.find((e) => e.rule === rule);
    const a = replay.find((e) => e.rule === rule);
    return {
      rule,
      label: b?.ruleLabel ?? a?.ruleLabel ?? rule,
      unit: b?.unit ?? a?.unit ?? "",
      previousValue: b?.newValue ?? null,
      replayValue: a?.newValue ?? null,
      changed: b?.newValue !== a?.newValue,
    };
  });

  return {
    export: "mitigation-replay-report" as const,
    generatedAt: new Date().toISOString(),
    dataSource: "demo/mock data — not financial advice",
    correlation: {
      previousId,
      replayId,
      label: replay[0]?.mitigation ?? previous[0]?.mitigation ?? "Mitigation",
    },
    timestamps: {
      previousRunAt: iso(previous[0]?.ts),
      replayRunAt: iso(replay[0]?.ts),
      previousOutcomeAt: iso(prevOutcome?.ts),
      replayOutcomeAt: iso(nextOutcome?.ts),
    },
    inputs: { rules, parametersIdentical: rules.every((r) => !r.changed) },
    previewContext,
    entries: { previous: previous.map(entryRow), replay: replay.map(entryRow) },
    results: {
      previous: prevOutcome
        ? { ...prevOutcome, timestamp: iso(prevOutcome.ts) }
        : null,
      replay: nextOutcome ? { ...nextOutcome, timestamp: iso(nextOutcome.ts) } : null,
      matchedDelta: (nextOutcome?.matched ?? 0) - (prevOutcome?.matched ?? 0),
      deliveredDelta: (nextOutcome?.delivered ?? 0) - (prevOutcome?.delivered ?? 0),
    },
    crawlChecks: {
      regressions: seo.regressions,
      improvements: seo.improvements,
      unchanged: seo.unchanged,
      addedPages: seo.added,
      removedPages: seo.removed,
      pages: seo.rows.map((r) => ({
        symbol: r.symbol,
        path: (r.after ?? r.before)?.path ?? null,
        presence: r.presence,
        changed: r.changed,
        before: r.before
          ? {
              canonical: r.before.canonical,
              robots: r.before.robots,
              redirect: r.before.redirect,
            }
          : null,
        after: r.after
          ? { canonical: r.after.canonical, robots: r.after.robots, redirect: r.after.redirect }
          : null,
      })),
    },
  };
}

export function buildReplayReportJson(input: ReplayReportInput) {
  return JSON.stringify(buildReplayReport(input), null, 2);
}

export function buildReplayReportCsv(input: ReplayReportInput) {
  const r = buildReplayReport(input);

  const meta = csvSection(
    ["field", "value"],
    [
      ["export", r.export],
      ["generated_at", r.generatedAt],
      ["data_source", "demo/mock data - not financial advice"],
      ["mitigation", r.correlation.label],
      ["previous_correlation_id", r.correlation.previousId],
      ["replay_correlation_id", r.correlation.replayId],
      ["previous_run_at", r.timestamps.previousRunAt ?? ""],
      ["replay_run_at", r.timestamps.replayRunAt ?? ""],
      ["previous_outcome_at", r.timestamps.previousOutcomeAt ?? ""],
      ["replay_outcome_at", r.timestamps.replayOutcomeAt ?? ""],
      ["parameters_identical", r.inputs.parametersIdentical ? "yes" : "no"],
    ],
  );

  const inputs = csvSection(
    ["rule", "label", "unit", "previous_value", "replay_value", "changed"],
    r.inputs.rules.map((x) => [
      x.rule,
      x.label,
      x.unit,
      x.previousValue ?? "",
      x.replayValue ?? "",
      x.changed ? "yes" : "no",
    ]),
  );

  const preview = csvSection(
    [
      "id",
      "timestamp",
      "rule",
      "operator",
      "old_value",
      "new_value",
      "preset",
      "window",
      "scope",
      "matches_before",
      "matches_after",
      "near_miss_before",
      "near_miss_after",
      "trigger",
    ],
    r.previewContext.map((e) => [
      e.id,
      e.timestamp ?? "",
      e.rule,
      e.operator,
      e.oldValue,
      e.newValue,
      e.preset,
      e.window ?? "",
      e.scope ?? "",
      e.matchesBefore ?? "",
      e.matchesAfter ?? "",
      e.nearMissBefore ?? "",
      e.nearMissAfter ?? "",
      e.trigger ?? "",
    ]),
  );

  const results = csvSection(
    ["run", "timestamp", "status", "matched", "delivered", "symbols", "channels"],
    [
      ["previous", r.results.previous, r.timestamps.previousOutcomeAt],
      ["replay", r.results.replay, r.timestamps.replayOutcomeAt],
    ].map(([run, o]) => {
      const outcome = o as (typeof r.results)["previous"];
      return [
        run as string,
        outcome?.timestamp ?? "",
        outcome?.status ?? "pending",
        outcome?.matched ?? "",
        outcome?.delivered ?? "",
        outcome?.symbols.join(" | ") ?? "",
        outcome?.channels.join(" | ") ?? "",
      ];
    }),
  );

  const checks = csvSection(
    [
      "symbol",
      "path",
      "presence",
      "canonical_before",
      "canonical_after",
      "robots_before",
      "robots_after",
      "redirect_before",
      "redirect_after",
      "changed_checks",
    ],
    r.crawlChecks.pages.map((p) => [
      p.symbol,
      p.path ?? "",
      p.presence,
      p.before?.canonical.status ?? "",
      p.after?.canonical.status ?? "",
      p.before?.robots.status ?? "",
      p.after?.robots.status ?? "",
      p.before?.redirect.status ?? "",
      p.after?.redirect.status ?? "",
      p.changed.join(" | "),
    ]),
  );

  return [
    meta,
    "\n# inputs (rule parameters)\n" + inputs,
    "\n# stored_preview_context\n" + preview,
    "\n# results\n" + results,
    "\n# crawl_checks\n" + checks,
    "",
  ].join("\n");
}

export function downloadReplayReport(body: string, format: "csv" | "json", replayId: string) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const blob = new Blob([body], {
    type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `replay-report-${replayId.replace(/[^a-z0-9-]/gi, "")}-${stamp}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
