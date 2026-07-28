import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Activity, ShieldAlert, Filter, X } from "lucide-react";
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
  matchDelta: number;
  nearMissDelta: number;
  matchesBefore?: number;
  matchesAfter?: number;
  nearMissBefore?: number;
  nearMissAfter?: number;
  symbols: string[];
  correlationId?: string;
  outcome?: string;
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

export function MitigationImpactTimeline() {
  const runs = useScanHistory();
  const { tuningLog } = usePaper();

  const [range, setRange] = useState<RangeKey>("7d");
  const [wallets, setWallets] = useState<string[]>([]);
  const [tokens, setTokens] = useState<string[]>([]);
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

  const riskPoints = useMemo<RiskPoint[]>(() => {
    return runs
      .filter((r) => r.scannedAt >= cutoff)
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
    return tuningLog
      .filter((e): e is TuningLogEntry => e.source === "mitigation" && e.phase !== "preview")
      .filter((e) => e.ts >= cutoff)
      .filter((e) => {
        if (tokens.length === 0) return true;
        const syms = e.outcome?.symbols ?? [];
        return syms.length === 0 ? false : syms.some((s) => tokens.includes(s));
      })
      .map((e) => ({
        ts: e.appliedAt ?? e.ts,
        label: e.mitigation ?? "Mitigation",
        rule: `${e.ruleLabel} ${e.operator} ${e.newValue}${e.unit}`,
        matchDelta: (e.matchesAfter ?? 0) - (e.matchesBefore ?? 0),
        nearMissDelta: (e.nearMissAfter ?? 0) - (e.nearMissBefore ?? 0),
        matchesBefore: e.matchesBefore,
        matchesAfter: e.matchesAfter,
        nearMissBefore: e.nearMissBefore,
        nearMissAfter: e.nearMissAfter,
        symbols: e.outcome?.symbols ?? [],
        correlationId: e.correlationId,
        outcome: e.outcome?.status,
      }))
      .sort((a, b) => a.ts - b.ts);
  }, [tuningLog, cutoff, tokens]);

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

  const activeFilters = wallets.length + tokens.length;

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
            {activeFilters > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs"
                onClick={() => {
                  setWallets([]);
                  setTokens([]);
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
        </div>

        {!hasData ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            Nothing to plot for this selection. Run a wallet scan or apply a mitigation, then widen
            the time range.
          </div>
        ) : (
          <>
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
                {riskPoints.map((p) => (
                  <circle
                    key={`${p.correlationId}-${p.ts}`}
                    cx={x(p.ts)}
                    cy={yRisk(p.score)}
                    r={4}
                    fill={RISK_COLOR[p.score]}
                    stroke="hsl(var(--background))"
                    strokeWidth={1.5}
                    className="cursor-pointer"
                    onMouseEnter={() => setHover({ kind: "risk", point: p })}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}

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
                      className="cursor-pointer"
                      onMouseEnter={() => setHover({ kind: "signal", point: p })}
                      onMouseLeave={() => setHover(null)}
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
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {hover.point.correlationId}
                  </div>
                </div>
              )}
              {hover?.kind === "signal" && (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">{hover.point.label}</span>
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
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {hover.point.correlationId}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
