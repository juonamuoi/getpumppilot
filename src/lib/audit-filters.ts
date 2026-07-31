/* ------------------------------------------------------------------ *
 * Mitigation audit-trail filters
 *
 * Shared between the audit trail UI, bulk export and scheduled exports so
 * a saved filter always resolves to exactly the same set of entries.
 * ------------------------------------------------------------------ */

import type { TuningLogEntry } from "@/lib/paper-store";

export type OutcomeFilter = "all" | "alerts-fired" | "no-matches" | "channels-muted" | "pending";
export type RangeFilter = "all" | "24h" | "7d" | "30d" | "90d";

export const RANGE_MS: Record<Exclude<RangeFilter, "all">, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

export const RANGE_LABEL: Record<RangeFilter, string> = {
  all: "All time",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

/** Everything that defines an export scope, so it can be named and re-used. */
export type AuditFilterState = {
  q: string;
  outcome: OutcomeFilter;
  range: RangeFilter;
  correlationIds: string[];
  /** Token symbols the mitigation's alert outcome touched (empty = all). */
  tokens: string[];
  /** Wallet addresses scanned around the mitigation (empty = all). */
  wallets: string[];
  /** Alert delivery channels, e.g. email / push / in-app (empty = all). */
  alertTypes: string[];
};

export type SavedAuditFilter = AuditFilterState & { id: string; name: string };

export const EMPTY_FILTER: AuditFilterState = {
  q: "",
  outcome: "all",
  range: "all",
  correlationIds: [],
  tokens: [],
  wallets: [],
  alertTypes: [],
};

export const SAVED_FILTERS_KEY = "pumppilot_audit_saved_filters";

export function loadSavedFilters(): SavedAuditFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_FILTERS_KEY);
    return raw ? (JSON.parse(raw) as SavedAuditFilter[]) : [];
  } catch {
    return [];
  }
}

/** Applies a saved/current filter to the mitigation audit log. */
export function filterAuditEntries(
  log: TuningLogEntry[],
  f: AuditFilterState,
  walletsFor?: (entry: TuningLogEntry) => string[],
  now = Date.now(),
): TuningLogEntry[] {
  const q = (f.q ?? "").trim().toLowerCase();
  const cids = f.correlationIds ?? [];
  const tokens = f.tokens ?? [];
  const alertTypes = f.alertTypes ?? [];
  const wallets = f.wallets ?? [];

  return log
    .filter((e) => e.source === "mitigation" && !!e.mitigation)
    .filter((e) => {
      if (f.outcome === "all") return true;
      if (f.outcome === "pending") return !e.outcome;
      return e.outcome?.status === f.outcome;
    })
    .filter((e) => (f.range === "all" ? true : now - e.ts <= RANGE_MS[f.range]))
    .filter((e) => (cids.length === 0 ? true : !!e.correlationId && cids.includes(e.correlationId)))
    .filter((e) => (tokens.length === 0 ? true : (e.outcome?.symbols ?? []).some((s) => tokens.includes(s))))
    .filter((e) =>
      alertTypes.length === 0 ? true : (e.outcome?.channels ?? []).some((c) => alertTypes.includes(c)),
    )
    .filter((e) => (wallets.length === 0 ? true : (walletsFor?.(e) ?? []).some((w) => wallets.includes(w))))
    .filter((e) => {
      if (!q) return true;
      const d = new Date(e.ts);
      const timestamps = [
        d.toISOString(), // 2026-07-31T01:47:00.000Z
        d.toISOString().slice(0, 10), // 2026-07-31
        d.toLocaleString(), // locale date + time
        d.toLocaleDateString(),
        d.toLocaleTimeString(),
        String(e.ts),
      ];
      return [
        e.mitigation,
        e.ruleLabel,
        e.trigger,
        e.correlationId,
        e.outcome?.symbols.join(" "),
        ...timestamps,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

}
