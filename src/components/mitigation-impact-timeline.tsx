import { useEffect, useId, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { Activity, ShieldAlert, Filter, X, ExternalLink, Download, Link2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ALL_TIMELINE_SECTIONS,
  TIMELINE_SECTIONS,
  buildTimelineCsv,
  buildTimelineJson,
  downloadTimelineExport,
  filterTimelineSections,
  type TimelineSection,
} from "@/lib/timeline-export";
import { TimelineAggregateSummary } from "@/components/timeline-aggregate-summary";
import { AuditEntryDrawer } from "@/components/audit-entry-drawer";
import { TimelineColumnPicker } from "@/components/timeline-column-picker";
import { useTimelineExportColumns } from "@/lib/timeline-export-prefs";


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScanHistory } from "@/lib/wallet-session";
import { usePaper } from "@/lib/paper-store";
import type { ApprovalRisk } from "@/lib/wallet-scan";
import type { TuningLogEntry } from "@/lib/paper-store";
import { explainFields } from "@/lib/mitigation-explain";


/* ------------------------------------------------------------------ *
 * Mitigation impact timeline
 *
 * Merges two demo-data streams on one time axis:
 *  - wallet risk level over time, from the local scan history
 *  - signal deltas (matches / near-miss) from applied mitigations
 * so you can see whether a mitigation actually moved risk and signal.
 * ------------------------------------------------------------------ */

const RISK_SCORE: Record<ApprovalRisk, number> = {
  safe: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
const RISK_LABEL: Record<number, string> = {
  0: "Safe",
  1: "Medium",
  2: "High",
  3: "Critical",
};
const RISK_COLOR: Record<number, string> = {
  0: "hsl(var(--chart-2, 152 60% 45%))",
  1: "hsl(45 90% 55%)",
  2: "hsl(28 90% 58%)",
  3: "hsl(0 80% 60%)",
};

const RANGES = [
  { key: "24h", label: "Last 24h", ms: 24 * 3600_000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 3600_000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 3600_000 },
  { key: "all", label: "All time", ms: Number.POSITIVE_INFINITY },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

/** How the mitigation was applied. */
type MitigationAction = "single" | "bulk" | "risk-bounds";
const ACTION_OPTIONS: { key: MitigationAction; label: string }[] = [
  { key: "single", label: "Single" },
  { key: "bulk", label: "Bulk" },
  { key: "risk-bounds", label: "Risk bounds" },
];

/** Alert outcome recorded right after the mitigation. */
type OutcomeKey = "alerts-fired" | "no-matches" | "channels-muted";
const OUTCOME_OPTIONS: { key: OutcomeKey; label: string }[] = [
  { key: "alerts-fired", label: "Alerts fired" },
  { key: "no-matches", label: "No matches" },
  { key: "channels-muted", label: "Channels muted" },
];

type RiskPoint = {
  ts: number;
  score: number;
  address: string;
  threats: number;
  valueAtRisk: number;
  correlationId: string;
  trigger: string;
};

type SignalPoint = {
  ts: number;
  label: string;
  rule: string;
  action: MitigationAction;
  matchDelta: number;
  nearMissDelta: number;
  matchesBefore?: number;
  matchesAfter?: number;
  nearMissBefore?: number;
  nearMissAfter?: number;
  symbols: string[];
  correlationId?: string;
  outcome?: string;
  diff?: string;
  ruleBefore?: string;
  ruleAfter?: string;
  why?: string;
  whyChange?: string;
  whyStrictness?: string;
  whyImpact?: string;
  whyOutcome?: string;
  whyFragility?: string;
};


function short(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function TokenChip({
  value,
  active,
  onToggle,
}: {
  value: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground"
      }`}
    >
      {value}
    </button>
  );
}

const FOCUS_KEY = "pp.timeline.focusCorrelationId";

export function MitigationImpactTimeline() {

  const runs = useScanHistory();
  const { tuningLog } = usePaper();
  const navigate = useNavigate();
  /** URL is the source of truth so a refresh restores the focused batch. */
  const search = useSearch({ strict: false }) as {
    audit?: string;
    tlrange?: string;
    tlw?: string;
    tlt?: string;
    tla?: string;
    tlo?: string;
  };
  const urlId = search.audit ?? null;
  const [drawerId, setDrawerId] = useState<string | null>(urlId);


  // Restore from local UI state when the URL has no focus (e.g. plain reload).
  useEffect(() => {
    if (urlId) return;
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(FOCUS_KEY);
    if (saved) {
      setDrawerId(saved);
      navigate({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, audit: saved }), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local state in sync when the URL changes (back/forward, deep link).
  useEffect(() => {
    setDrawerId(urlId);
  }, [urlId]);

  const setFocus = (id: string | null) => {
    setDrawerId(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(FOCUS_KEY, id);
      else window.localStorage.removeItem(FOCUS_KEY);
    }
    navigate({
      to: ".",
      search: (p: Record<string, unknown>) => ({ ...p, audit: id ?? undefined }),
      replace: true,
    });
  };

  const openAudit = (id?: string) => {
    if (!id) return;
    setFocus(id);
  };

  /**
   * Timeline marker → opens the focused audit entries in a right-side drawer,
   * without leaving the page.
   */
  const CorrelationLink = ({ id }: { id: string }) => (
    <button
      type="button"
      onClick={() => openAudit(id)}
      className="inline-flex items-center gap-1 font-mono text-[10px] text-primary underline-offset-2 hover:underline"
      title="Open the matching audit entries in a side drawer"
    >
      {id}
      <ExternalLink className="h-3 w-3" />
    </button>
  );


  /** Roving keyboard navigation across every clickable timeline marker. */
  const markerPrefix = useId().replace(/:/g, "");
  const markerId = (kind: "risk" | "sig", i: number) => `${markerPrefix}-${kind}-${i}`;
  const focusMarker = (order: string[], from: string, step: number | "first" | "last") => {
    if (order.length === 0) return;
    const cur = order.indexOf(from);
    const next =
      step === "first"
        ? 0
        : step === "last"
          ? order.length - 1
          : Math.min(order.length - 1, Math.max(0, (cur < 0 ? 0 : cur) + step));
    const el = document.getElementById(order[next]) as SVGElement | null;
    el?.focus();
  };
  const markerKeyDown = (
    e: React.KeyboardEvent,
    order: string[],
    id: string,
    open: () => void,
  ) => {
    switch (e.key) {
      case "Enter":
      case " ":
      case "Spacebar":
        e.preventDefault();
        open();
        break;
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusMarker(order, id, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusMarker(order, id, -1);
        break;
      case "Home":
        e.preventDefault();
        focusMarker(order, id, "first");
        break;
      case "End":
        e.preventDefault();
        focusMarker(order, id, "last");
        break;
      default:
        break;
    }
  };

  /** Shareable view state: seeded from the URL, then written back on change. */
  const csv = (v?: string) => (v ? v.split(",").filter(Boolean) : []);
  const [range, setRange] = useState<RangeKey>(
    (RANGES.some((r) => r.key === search.tlrange) ? (search.tlrange as RangeKey) : "7d"),
  );
  const [wallets, setWallets] = useState<string[]>(() => csv(search.tlw));
  const [tokens, setTokens] = useState<string[]>(() => csv(search.tlt));
  const [actions, setActions] = useState<MitigationAction[]>(
    () => csv(search.tla) as MitigationAction[],
  );
  const [outcomes, setOutcomes] = useState<OutcomeKey[]>(() => csv(search.tlo) as OutcomeKey[]);

  // Keep the URL in sync so the current view can be copied and shared as-is.
  useEffect(() => {
    navigate({
      to: ".",
      search: (p: Record<string, unknown>) => ({
        ...p,
        tlrange: range === "7d" ? undefined : range,
        tlw: wallets.length ? wallets.join(",") : undefined,
        tlt: tokens.length ? tokens.join(",") : undefined,
        tla: actions.length ? actions.join(",") : undefined,
        tlo: outcomes.length ? outcomes.join(",") : undefined,
      }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, wallets, tokens, actions, outcomes]);

  const copyShareLink = async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Share link copied", {
        description: "Opens this timeline with the same filters and focus.",
      });
    } catch {
      toast.error("Could not copy link");
    }
  };

  const [hover, setHover] = useState<
    | { kind: "risk"; point: RiskPoint }
    | { kind: "signal"; point: SignalPoint }
    | null
  >(null);

  const allWallets = useMemo(
    () => Array.from(new Set(runs.map((r) => r.address))),
    [runs],
  );
  const allTokens = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((r) => r.threats.forEach((t) => set.add(t.token)));
    tuningLog.forEach((e) => e.outcome?.symbols.forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [runs, tuningLog]);

  const cutoff = useMemo(() => {
    const ms = RANGES.find((r) => r.key === range)!.ms;
    return Number.isFinite(ms) ? Date.now() - ms : 0;
  }, [range]);

  /** All-time points (no time filter) so comparison windows can look further back. */
  const allRiskPoints = useMemo<RiskPoint[]>(() => {
    return runs
      .filter((r) => wallets.length === 0 || wallets.includes(r.address))
      .map((r) => {
        const threats =
          tokens.length === 0 ? r.threats : r.threats.filter((t) => tokens.includes(t.token));
        const score = threats.reduce((m, t) => Math.max(m, RISK_SCORE[t.risk] ?? 0), 0);
        return {
          ts: r.scannedAt,
          score,
          address: r.address,
          threats: threats.length,
          valueAtRisk: threats.reduce((s, t) => s + t.valueAtRiskUsd, 0),
          correlationId: r.correlationId,
          trigger: r.trigger,
        };
      })
      .sort((a, b) => a.ts - b.ts);
  }, [runs, cutoff, wallets, tokens]);

  const signalPoints = useMemo<SignalPoint[]>(() => {
    const applied = tuningLog.filter(
      (e): e is TuningLogEntry => e.source === "mitigation" && e.phase !== "preview",
    );
    // A correlation id shared by several rule changes means the mitigation was
    // applied as a bulk batch; a bounds change is its own action type.
    const batchSize = new Map<string, number>();
    applied.forEach((e) => {
      if (!e.correlationId) return;
      batchSize.set(e.correlationId, (batchSize.get(e.correlationId) ?? 0) + 1);
    });
    const actionOf = (e: TuningLogEntry): MitigationAction =>
      e.kind === "bounds"
        ? "risk-bounds"
        : (e.correlationId ? (batchSize.get(e.correlationId) ?? 1) : 1) > 1
          ? "bulk"
          : "single";

    return applied
      .filter((e) => e.ts >= cutoff)
      .filter((e) => {
        if (tokens.length === 0) return true;
        const syms = e.outcome?.symbols ?? [];
        return syms.length === 0 ? false : syms.some((s) => tokens.includes(s));
      })
      .filter((e) => actions.length === 0 || actions.includes(actionOf(e)))
      .filter((e) => {
        if (outcomes.length === 0) return true;
        const status = e.outcome?.status;
        return status ? outcomes.includes(status) : false;
      })
      .map((e) => {
        const fields = explainFields(e);
        const before = `${e.ruleLabel} ${e.operator} ${e.oldValue}${e.unit}`;
        const after = `${e.ruleLabel} ${e.operator} ${e.newValue}${e.unit}`;
        return {
          ts: e.appliedAt ?? e.ts,
          label: e.mitigation ?? "Mitigation",
          rule: after,
          action: actionOf(e),
          matchDelta: (e.matchesAfter ?? 0) - (e.matchesBefore ?? 0),
          nearMissDelta: (e.nearMissAfter ?? 0) - (e.nearMissBefore ?? 0),
          matchesBefore: e.matchesBefore,
          matchesAfter: e.matchesAfter,
          nearMissBefore: e.nearMissBefore,
          nearMissAfter: e.nearMissAfter,
          symbols: e.outcome?.symbols ?? [],
          correlationId: e.correlationId,
          outcome: e.outcome?.status,
          ruleBefore: before,
          ruleAfter: after,
          diff: before === after ? `${after} (unchanged)` : `${before} → ${after}`,
          ...fields,
        };
      })

      .sort((a, b) => a.ts - b.ts);
  }, [tuningLog, cutoff, tokens, actions, outcomes]);

  /** DOM ids of every focusable marker, in chronological order. */
  const markerOrder = useMemo(
    () =>
      [
        ...riskPoints.map((p, i) => ({ ts: p.ts, id: markerId("risk", i) })),
        ...signalPoints.map((p, i) => ({ ts: p.ts, id: markerId("sig", i) })),
      ]
        .sort((a, b) => a.ts - b.ts)
        .map((m) => m.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [riskPoints, signalPoints, markerPrefix],
  );

  const hasData = riskPoints.length > 0 || signalPoints.length > 0;

  const bounds = useMemo(() => {
    const all = [...riskPoints.map((p) => p.ts), ...signalPoints.map((p) => p.ts)];
    if (all.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...all);
    const max = Math.max(...all);
    return min === max ? { min: min - 3600_000, max: max + 3600_000 } : { min, max };
  }, [riskPoints, signalPoints]);

  const W = 720;
  const H = 190;
  const PAD_L = 44;
  const PAD_R = 12;
  const RISK_TOP = 14;
  const RISK_H = 92;
  const SIG_TOP = 122;
  const SIG_H = 52;

  const x = (ts: number) =>
    PAD_L + ((ts - bounds.min) / (bounds.max - bounds.min || 1)) * (W - PAD_L - PAD_R);
  const yRisk = (score: number) => RISK_TOP + RISK_H - (score / 3) * RISK_H;

  const maxAbsDelta = Math.max(
    1,
    ...signalPoints.map((p) => Math.max(Math.abs(p.matchDelta), Math.abs(p.nearMissDelta))),
  );
  const sigMid = SIG_TOP + SIG_H / 2;
  const barH = (v: number) => (Math.abs(v) / maxAbsDelta) * (SIG_H / 2);

  const riskPath = riskPoints
    .map((p, i) => {
      const px = x(p.ts);
      const py = yRisk(p.score);
      if (i === 0) return `M ${px} ${py}`;
      const prev = riskPoints[i - 1];
      return `L ${px} ${yRisk(prev.score)} L ${px} ${py}`;
    })
    .join(" ");

  // Per-user CSV column selection (persisted).
  const columnPrefs = useTimelineExportColumns();

  // Which sections land in the export file (all selected by default).
  const [sections, setSections] = useState<TimelineSection[]>(ALL_TIMELINE_SECTIONS);
  const toggleSection = (key: TimelineSection) =>
    setSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  const sectionCounts = useMemo(() => {
    const counts: Record<TimelineSection, number> = {
      risk: riskPoints.length,
      matched: 0,
      nearMiss: 0,
      noMatch: 0,
    };
    for (const key of ["matched", "nearMiss", "noMatch"] as const) {
      counts[key] = filterTimelineSections([key], [], signalPoints).signals.length;
    }
    return counts;
  }, [riskPoints, signalPoints]);

  const activeFilters = wallets.length + tokens.length + actions.length + outcomes.length;

  // Exports the filtered view; when a correlation ID is focused (deep link /
  // timeline marker drawer), exports default to that correlation scope.
  const exportTimeline = (fmt: "csv" | "json", scoped = !!drawerId) => {
    if (sections.length === 0) {
      toast.error("Pick at least one section to export");
      return;
    }
    const cols = columnPrefs.columns;
    if (fmt === "csv" && !cols.meta.length && !cols.risk.length && !cols.mitigation.length) {
      toast.error("Pick at least one CSV column to export");
      return;
    }
    const focus = scoped ? drawerId : null;
    const rp = focus ? riskPoints.filter((p) => p.correlationId === focus) : riskPoints;
    const sp = focus ? signalPoints.filter((p) => p.correlationId === focus) : signalPoints;
    const filters = {
      range,
      rangeLabel: focus
        ? `${RANGES.find((r) => r.key === range)!.label} · correlation ${focus}`
        : RANGES.find((r) => r.key === range)!.label,
      from: cutoff || null,
      to: Date.now(),
      wallets,
      tokens,
      actions,
      outcomes,
      correlationId: focus ?? undefined,
      sections,
      columns: cols,
    };
    const body =
      fmt === "csv" ? buildTimelineCsv(filters, rp, sp) : buildTimelineJson(filters, rp, sp);
    downloadTimelineExport(body, fmt);
  };



  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Mitigation impact timeline
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Wallet risk level and mitigation signal deltas on one axis. Demo data.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              onClick={copyShareLink}
              title="Copy a link that reopens this exact timeline view"
            >
              <Link2 className="h-3 w-3" /> Share view
            </Button>
            <TimelineColumnPicker {...columnPrefs} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                  disabled={!hasData}
                >
                  <Download className="h-3 w-3" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs">Sections to export</DropdownMenuLabel>
                {TIMELINE_SECTIONS.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s.key}
                    className="text-xs"
                    checked={sections.includes(s.key)}
                    onCheckedChange={() => toggleSection(s.key)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span>
                        {s.label}
                        <span className="block text-[10px] text-muted-foreground">{s.hint}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {sectionCounts[s.key]}
                      </span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
                <div className="flex gap-2 px-2 pb-1 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 flex-1 text-[10px]"
                    onClick={() => setSections(ALL_TIMELINE_SECTIONS)}
                  >
                    Select all
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 flex-1 text-[10px]"
                    onClick={() => setSections([])}
                  >
                    Clear
                  </Button>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs" onSelect={() => exportTimeline("csv")}>
                  Download CSV{drawerId ? ` — ${drawerId}` : ""}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onSelect={() => exportTimeline("json")}>
                  Download JSON{drawerId ? ` — ${drawerId}` : ""}
                </DropdownMenuItem>
                {drawerId && (
                  <>
                    <DropdownMenuItem
                      className="text-xs"
                      onSelect={() => exportTimeline("csv", false)}
                    >
                      Download CSV — all filtered
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs"
                      onSelect={() => exportTimeline("json", false)}
                    >
                      Download JSON — all filtered
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>

            </DropdownMenu>
            {activeFilters > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs"
                onClick={() => {
                  setWallets([]);
                  setTokens([]);
                  setActions([]);
                  setOutcomes([]);
                }}
              >
                <X className="h-3 w-3" /> Clear ({activeFilters})
              </Button>
            )}

            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.key} value={r.key} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Filter className="h-3 w-3" /> Wallets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allWallets.length === 0 && (
              <span className="text-[11px] text-muted-foreground">No scans recorded yet.</span>
            )}
            {allWallets.map((a) => (
              <TokenChip
                key={a}
                value={short(a)}
                active={wallets.includes(a)}
                onToggle={() =>
                  setWallets((prev) =>
                    prev.includes(a) ? prev.filter((w) => w !== a) : [...prev, a],
                  )
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5 pt-1 text-[11px] font-medium text-muted-foreground">
            <Filter className="h-3 w-3" /> Tokens
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTokens.length === 0 && (
              <span className="text-[11px] text-muted-foreground">No token activity yet.</span>
            )}
            {allTokens.map((t) => (
              <TokenChip
                key={t}
                value={t}
                active={tokens.includes(t)}
                onToggle={() =>
                  setTokens((prev) =>
                    prev.includes(t) ? prev.filter((x2) => x2 !== t) : [...prev, t],
                  )
                }
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5 pt-1 text-[11px] font-medium text-muted-foreground">
            <Filter className="h-3 w-3" /> Mitigation action
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ACTION_OPTIONS.map((o) => (
              <TokenChip
                key={o.key}
                value={o.label}
                active={actions.includes(o.key)}
                onToggle={() =>
                  setActions((prev) =>
                    prev.includes(o.key) ? prev.filter((a) => a !== o.key) : [...prev, o.key],
                  )
                }
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5 pt-1 text-[11px] font-medium text-muted-foreground">
            <Filter className="h-3 w-3" /> Outcome
          </div>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOME_OPTIONS.map((o) => (
              <TokenChip
                key={o.key}
                value={o.label}
                active={outcomes.includes(o.key)}
                onToggle={() =>
                  setOutcomes((prev) =>
                    prev.includes(o.key) ? prev.filter((s) => s !== o.key) : [...prev, o.key],
                  )
                }
              />
            ))}
          </div>
          <p className="pt-1 text-[10px] text-muted-foreground">
            Action and outcome filters apply to mitigation markers only; wallet risk scans stay
            plotted for context.
          </p>
        </div>

        {!hasData ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            Nothing to plot for this selection. Run a wallet scan or apply a mitigation, then widen
            the time range.
          </div>
        ) : (
          <>
            <TimelineAggregateSummary
              riskPoints={riskPoints}
              signalPoints={signalPoints}
              scope={{
                rangeLabel: RANGES.find((r) => r.key === range)?.label,
                from: cutoff || null,
                to: Date.now(),
                wallets,
                tokens,
                actions,
                outcomes,
                correlationId: drawerId ?? undefined,
              }}
            />

            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="h-[220px] w-full min-w-[560px]"
                role="img"
                aria-label="Risk level and signal delta timeline"
              >
                {/* risk gridlines */}
                {[0, 1, 2, 3].map((s) => (
                  <g key={s}>
                    <line
                      x1={PAD_L}
                      x2={W - PAD_R}
                      y1={yRisk(s)}
                      y2={yRisk(s)}
                      stroke="hsl(var(--border))"
                      strokeDasharray="3 4"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_L - 6}
                      y={yRisk(s) + 3}
                      textAnchor="end"
                      className="fill-muted-foreground"
                      fontSize={8}
                    >
                      {RISK_LABEL[s]}
                    </text>
                  </g>
                ))}

                {/* risk step line */}
                {riskPath && (
                  <path d={riskPath} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.8} />
                )}
                {riskPoints.map((p, i) => {
                  const id = markerId("risk", i);
                  return (
                    <circle
                      key={`${p.correlationId}-${p.ts}`}
                      id={id}
                      cx={x(p.ts)}
                      cy={yRisk(p.score)}
                      r={4}
                      fill={RISK_COLOR[p.score]}
                      stroke="hsl(var(--background))"
                      strokeWidth={1.5}
                      className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      tabIndex={0}
                      role="button"
                      aria-label={`Wallet risk ${RISK_LABEL[p.score]} on ${format(new Date(p.ts), "d MMM HH:mm")}${p.correlationId ? `, correlation ${p.correlationId}. Press Enter to open the replay view.` : ""}`}
                      onMouseEnter={() => setHover({ kind: "risk", point: p })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover({ kind: "risk", point: p })}
                      onBlur={() => setHover(null)}
                      onClick={() => openAudit(p.correlationId)}
                      onKeyDown={(e) =>
                        markerKeyDown(e, markerOrder, id, () => openAudit(p.correlationId))
                      }
                    />
                  );
                })}


                {/* signal delta baseline */}
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={sigMid}
                  y2={sigMid}
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                />
                <text
                  x={PAD_L - 6}
                  y={sigMid + 3}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  fontSize={8}
                >
                  Δ0
                </text>

                {signalPoints.map((p, i) => {
                  const px = x(p.ts);
                  const mh = barH(p.matchDelta);
                  const nh = barH(p.nearMissDelta);
                  return (
                    <g
                      key={`${p.correlationId ?? "sig"}-${i}`}
                      id={markerId("sig", i)}
                      onClick={() => openAudit(p.correlationId)}
                      className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      tabIndex={0}
                      role="button"
                      aria-label={`Mitigation marker on ${format(new Date(p.ts), "d MMM HH:mm")}, match delta ${p.matchDelta}, near-miss delta ${p.nearMissDelta}${p.correlationId ? `, correlation ${p.correlationId}. Press Enter to open the replay view.` : ""}`}
                      onMouseEnter={() => setHover({ kind: "signal", point: p })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover({ kind: "signal", point: p })}
                      onBlur={() => setHover(null)}
                      onKeyDown={(e) =>
                        markerKeyDown(e, markerOrder, markerId("sig", i), () =>
                          openAudit(p.correlationId),
                        )
                      }
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={RISK_TOP}
                        y2={SIG_TOP + SIG_H}
                        stroke="hsl(var(--primary))"
                        strokeOpacity={0.25}
                        strokeDasharray="2 3"
                      />
                      <rect
                        x={px - 6}
                        y={p.matchDelta >= 0 ? sigMid - mh : sigMid}
                        width={5}
                        height={Math.max(mh, 1)}
                        fill="hsl(200 90% 60%)"
                      />
                      <rect
                        x={px + 1}
                        y={p.nearMissDelta >= 0 ? sigMid - nh : sigMid}
                        width={5}
                        height={Math.max(nh, 1)}
                        fill="hsl(28 90% 58%)"
                      />
                      <rect
                        x={px - 10}
                        y={RISK_TOP}
                        width={20}
                        height={SIG_TOP + SIG_H - RISK_TOP}
                        fill="transparent"
                      />
                    </g>
                  );
                })}

                {/* axis labels */}
                <text x={PAD_L} y={H - 2} className="fill-muted-foreground" fontSize={8}>
                  {format(bounds.min, "d MMM HH:mm")}
                </text>
                <text
                  x={W - PAD_R}
                  y={H - 2}
                  textAnchor="end"
                  className="fill-muted-foreground"
                  fontSize={8}
                >
                  {format(bounds.max, "d MMM HH:mm")}
                </text>
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-primary" /> Wallet risk level
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2 rounded-sm" style={{ background: "hsl(200 90% 60%)" }} />
                Match delta
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2 rounded-sm" style={{ background: "hsl(28 90% 58%)" }} />
                Near-miss delta
              </span>
            </div>

            {/* Hover detail */}
            <div className="min-h-[72px] rounded-lg border border-border/60 bg-muted/10 p-3 text-xs">
              {!hover && (
                <span className="text-muted-foreground">
                  Hover a scan point or mitigation marker for details.
                </span>
              )}
              {hover?.kind === "risk" && (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">{RISK_LABEL[hover.point.score]} risk</span>
                    <Badge variant="outline" className="text-[10px]">
                      {hover.point.trigger} scan
                    </Badge>
                    <span className="text-muted-foreground">
                      {format(hover.point.ts, "d MMM yyyy HH:mm:ss")}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {short(hover.point.address)} · {hover.point.threats} threat
                    {hover.point.threats === 1 ? "" : "s"} · $
                    {Math.round(hover.point.valueAtRisk).toLocaleString()} at risk
                  </div>
                  <CorrelationLink id={hover.point.correlationId} />

                </div>
              )}
              {hover?.kind === "signal" && (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">{hover.point.label}</span>
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {hover.point.action.replace("-", " ")}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {hover.point.rule}
                    </Badge>
                    <span className="text-muted-foreground">
                      {format(hover.point.ts, "d MMM yyyy HH:mm:ss")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-muted-foreground">
                    <span>
                      Matches{" "}
                      <span className="font-mono text-foreground">
                        {hover.point.matchesBefore ?? "—"} → {hover.point.matchesAfter ?? "—"}
                      </span>{" "}
                      ({hover.point.matchDelta >= 0 ? "+" : ""}
                      {hover.point.matchDelta})
                    </span>
                    <span>
                      Near-miss{" "}
                      <span className="font-mono text-foreground">
                        {hover.point.nearMissBefore ?? "—"} → {hover.point.nearMissAfter ?? "—"}
                      </span>{" "}
                      ({hover.point.nearMissDelta >= 0 ? "+" : ""}
                      {hover.point.nearMissDelta})
                    </span>
                    {hover.point.outcome && <span>Outcome: {hover.point.outcome}</span>}
                  </div>
                  {hover.point.symbols.length > 0 && (
                    <div className="text-muted-foreground">
                      Tokens: {hover.point.symbols.join(", ")}
                    </div>
                  )}
                  {hover.point.correlationId && (
                    <CorrelationLink id={hover.point.correlationId} />
                  )}

                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
      <AuditEntryDrawer
        correlationId={drawerId}
        onOpenChange={(o) => !o && setFocus(null)}
      />
    </Card>
  );
}
