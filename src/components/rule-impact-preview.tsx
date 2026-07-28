import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, ChevronDown, Download, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { ASSETS } from "@/lib/mock-data";
import { usePaper, type ScannerRules } from "@/lib/paper-store";
import { cn } from "@/lib/utils";

type Asset = (typeof ASSETS)[number];

export type RuleChangeSnapshot = {
  before: ScannerRules;
  after: ScannerRules;
  ts: number;
};

type ScopeKey = "portfolio" | "majors" | "demo" | "all";

const SCOPES: { key: ScopeKey; label: string }[] = [
  { key: "portfolio", label: "My watchlist (paper holdings)" },
  { key: "majors", label: "Majors (BTC, ETH, SOL, BNB)" },
  { key: "demo", label: "DEMO small-caps" },
  { key: "all", label: "All mock assets" },
];

/** Human-readable before/after deltas for each scanner threshold. */
function ruleDeltas(b: ScannerRules, a: ScannerRules) {
  return [
    { label: "Min momentum", before: String(b.minMomentum), after: String(a.minMomentum), changed: b.minMomentum !== a.minMomentum },
    { label: "Min volume score", before: String(b.minVolumeScore), after: String(a.minVolumeScore), changed: b.minVolumeScore !== a.minVolumeScore },
    { label: "Max volatility", before: String(b.maxVolatility), after: String(a.maxVolatility), changed: b.maxVolatility !== a.maxVolatility },
    { label: "Min 24h change", before: `${b.min24hChangePct}%`, after: `${a.min24hChangePct}%`, changed: b.min24hChangePct !== a.min24hChangePct },
    { label: "Include majors", before: b.includeMajors ? "yes" : "no", after: a.includeMajors ? "yes" : "no", changed: b.includeMajors !== a.includeMajors },
    { label: "Include DEMO small-caps", before: b.includeDemoSmallCaps ? "yes" : "no", after: a.includeDemoSmallCaps ? "yes" : "no", changed: b.includeDemoSmallCaps !== a.includeDemoSmallCaps },
  ];
}

function signals(rules: ScannerRules, a: Asset) {
  const checks = {
    category:
      (a.category === "major" && rules.includeMajors) ||
      (a.category === "demo-smallcap" && rules.includeDemoSmallCaps),
    momentum: a.momentum.total >= rules.minMomentum,
    volume: a.momentum.volume >= rules.minVolumeScore,
    volatility: a.momentum.volatility <= rules.maxVolatility,
    change: a.change24h >= rules.min24hChangePct,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    checks,
    matched: Object.values(checks).every(Boolean),
    /** 0-100 confidence-style strength: how comfortably the asset clears the bar. */
    strength: Math.round((passed / 5) * 100),
  };
}

export function RuleImpactPreview({
  change,
  onDismiss,
}: {
  change: RuleChangeSnapshot;
  onDismiss: () => void;
}) {
  const { positions } = usePaper();
  const held = useMemo(() => new Set(positions.map((p) => p.symbol)), [positions]);
  const [scope, setScope] = useState<ScopeKey>(held.size > 0 ? "portfolio" : "all");

  const scoped = useMemo(() => {
    if (scope === "portfolio") return ASSETS.filter((a) => held.has(a.symbol));
    if (scope === "majors") return ASSETS.filter((a) => a.category === "major");
    if (scope === "demo") return ASSETS.filter((a) => a.category === "demo-smallcap");
    return ASSETS;
  }, [scope, held]);

  const rows = useMemo(
    () =>
      scoped
        .map((a) => {
          const before = signals(change.before, a);
          const after = signals(change.after, a);
          const status: "gained" | "lost" | "same" =
            before.matched === after.matched ? "same" : after.matched ? "gained" : "lost";
          return { asset: a, before, after, status };
        })
        .sort((x, y) => {
          const rank = { gained: 0, lost: 1, same: 2 } as const;
          return rank[x.status] - rank[y.status] || y.after.strength - x.after.strength;
        }),
    [scoped, change],
  );

  const gained = rows.filter((x) => x.status === "gained").length;
  const lost = rows.filter((x) => x.status === "lost").length;
  const matchedBefore = rows.filter((x) => x.before.matched).length;
  const matchedAfter = rows.filter((x) => x.after.matched).length;
  const avgBefore = rows.length
    ? Math.round(rows.reduce((s, x) => s + x.before.strength, 0) / rows.length)
    : 0;
  const avgAfter = rows.length
    ? Math.round(rows.reduce((s, x) => s + x.after.strength, 0) / rows.length)
    : 0;

  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{ id: string; at: number } | null>(null);

  const handleExportPdf = async () => {
    if (!rows.length) return;
    setExporting(true);
    try {
      const { exportImpactReportPdf } = await import("@/lib/impact-report-pdf");
      const built = await exportImpactReportPdf({
        scopeLabel: SCOPES.find((s) => s.key === scope)?.label ?? "All mock assets",
        savedAt: change.ts,
        ruleDeltas: ruleDeltas(change.before, change.after),
        rows: rows.map((r) => ({
          symbol: r.asset.symbol,
          category: r.asset.category,
          held: held.has(r.asset.symbol),
          status: r.status,
          strengthBefore: r.before.strength,
          strengthAfter: r.after.strength,
          matchedBefore: r.before.matched,
          matchedAfter: r.after.matched,
          reasons: explainAsset(r.asset, change.before, change.after).map((x) => ({
            label: x.label,
            input: x.input,
            thresholdBefore: x.thresholdBefore,
            thresholdAfter: x.thresholdAfter,
            before: x.before,
            after: x.after,
            sentence: x.sentence,
          })),
        })),
      });
      setLastExport({ id: built.correlationId, at: built.generatedAt });
      toast.success("Impact report exported", {
        description: `${built.filename} · correlation ID ${built.correlationId}`,
      });
    } catch (e) {
      toast.error("Could not generate the impact PDF", {
        description: e instanceof Error ? e.message : "Unexpected error",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/[0.04]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-300" />
            Impact of your saved rule change
          </span>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              onClick={handleExportPdf}
              disabled={exporting || rows.length === 0}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export impact (PDF)
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss}>
              <X className="h-4 w-4" />
              <span className="sr-only">Dismiss impact preview</span>
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <Label className="text-xs">Compare on</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ScopeKey)}>
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-[11px] text-muted-foreground sm:text-right">
            <p>Mock/demo data. Signals are probabilistic — not investment advice.</p>
            {lastExport && (
              <p className="font-mono text-[10px]">
                Last PDF: {lastExport.id} · {new Date(lastExport.at).toLocaleString()} (UTC{" "}
                {new Date(lastExport.at).toISOString()})
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Tile label="Signals before" value={String(matchedBefore)} />
          <Tile
            label="Signals after"
            value={String(matchedAfter)}
            tone={matchedAfter > matchedBefore ? "up" : matchedAfter < matchedBefore ? "down" : undefined}
          />
          <Tile label="New signals" value={`+${gained}`} tone={gained ? "up" : undefined} />
          <Tile label="Signals lost" value={`-${lost}`} tone={lost ? "down" : undefined} />
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          Average signal strength across scope:{" "}
          <span className="font-mono text-foreground">{avgBefore}%</span>{" "}
          <ArrowRight className="inline h-3 w-3" />{" "}
          <span
            className={cn(
              "font-mono",
              avgAfter > avgBefore ? "text-emerald-300" : avgAfter < avgBefore ? "text-rose-300" : "text-foreground",
            )}
          >
            {avgAfter}%
          </span>
        </div>

        {rows.length > 0 && <BeforeAfterChart rows={rows} />}

        {rows.length > 0 && (
          <RuleBacktestPanel
            before={change.before}
            after={change.after}
            assets={scoped}
            scopeLabel={SCOPES.find((s) => s.key === scope)?.label ?? "All mock assets"}
          />
        )}


        {rows.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No assets in this scope yet — open a paper position or pick another scope.
          </div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
            {rows.map((row) => (
              <AssetImpactRow
                key={row.asset.symbol}
                row={row}
                change={change}
                held={held.has(row.asset.symbol)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-mono text-lg",
          tone === "up" && "text-emerald-300",
          tone === "down" && "text-rose-300",
        )}
      >
        {value}
      </div>
    </div>
  );
}

type Row = {
  asset: Asset;
  before: ReturnType<typeof signals>;
  after: ReturnType<typeof signals>;
  status: "gained" | "lost" | "same";
};

const CHECK_LABELS: Record<keyof ReturnType<typeof signals>["checks"], string> = {
  category: "Asset class",
  momentum: "Momentum score",
  volume: "Volume score",
  volatility: "Volatility cap",
  change: "24h change",
};

type CheckKey = keyof ReturnType<typeof signals>["checks"];

type Reason = {
  key: CheckKey;
  label: string;
  /** the asset input this rule reads */
  input: string;
  thresholdBefore: string;
  thresholdAfter: string;
  thresholdChanged: boolean;
  before: boolean;
  after: boolean;
  sentence: string;
};

const fmt = (n: number, suffix = "") => `${Number(n.toFixed(2))}${suffix}`;

/** Explains, per asset, which rules and inputs drove the before/after delta. */
function explainAsset(asset: Asset, b: ScannerRules, a: ScannerRules): Reason[] {
  const rows: Reason[] = [
    {
      key: "momentum",
      label: CHECK_LABELS.momentum,
      input: `momentum ${fmt(asset.momentum.total)}`,
      thresholdBefore: `≥ ${fmt(b.minMomentum)}`,
      thresholdAfter: `≥ ${fmt(a.minMomentum)}`,
      thresholdChanged: b.minMomentum !== a.minMomentum,
      before: asset.momentum.total >= b.minMomentum,
      after: asset.momentum.total >= a.minMomentum,
      sentence: "",
    },
    {
      key: "volume",
      label: CHECK_LABELS.volume,
      input: `volume score ${fmt(asset.momentum.volume)}`,
      thresholdBefore: `≥ ${fmt(b.minVolumeScore)}`,
      thresholdAfter: `≥ ${fmt(a.minVolumeScore)}`,
      thresholdChanged: b.minVolumeScore !== a.minVolumeScore,
      before: asset.momentum.volume >= b.minVolumeScore,
      after: asset.momentum.volume >= a.minVolumeScore,
      sentence: "",
    },
    {
      key: "volatility",
      label: CHECK_LABELS.volatility,
      input: `volatility ${fmt(asset.momentum.volatility)}`,
      thresholdBefore: `≤ ${fmt(b.maxVolatility)}`,
      thresholdAfter: `≤ ${fmt(a.maxVolatility)}`,
      thresholdChanged: b.maxVolatility !== a.maxVolatility,
      before: asset.momentum.volatility <= b.maxVolatility,
      after: asset.momentum.volatility <= a.maxVolatility,
      sentence: "",
    },
    {
      key: "change",
      label: CHECK_LABELS.change,
      input: `24h change ${fmt(asset.change24h, "%")}`,
      thresholdBefore: `≥ ${fmt(b.min24hChangePct, "%")}`,
      thresholdAfter: `≥ ${fmt(a.min24hChangePct, "%")}`,
      thresholdChanged: b.min24hChangePct !== a.min24hChangePct,
      before: asset.change24h >= b.min24hChangePct,
      after: asset.change24h >= a.min24hChangePct,
      sentence: "",
    },
    {
      key: "category",
      label: CHECK_LABELS.category,
      input: asset.category === "major" ? "major" : "DEMO small-cap",
      thresholdBefore:
        asset.category === "major"
          ? b.includeMajors
            ? "included"
            : "excluded"
          : b.includeDemoSmallCaps
            ? "included"
            : "excluded",
      thresholdAfter:
        asset.category === "major"
          ? a.includeMajors
            ? "included"
            : "excluded"
          : a.includeDemoSmallCaps
            ? "included"
            : "excluded",
      thresholdChanged:
        asset.category === "major"
          ? b.includeMajors !== a.includeMajors
          : b.includeDemoSmallCaps !== a.includeDemoSmallCaps,
      before:
        asset.category === "major" ? b.includeMajors : b.includeDemoSmallCaps,
      after: asset.category === "major" ? a.includeMajors : a.includeDemoSmallCaps,
      sentence: "",
    },
  ];

  return rows.map((r) => {
    if (r.before === r.after) {
      r.sentence = r.thresholdChanged
        ? `Threshold moved (${r.thresholdBefore} → ${r.thresholdAfter}) but ${r.input} still ${r.after ? "clears" : "misses"} it.`
        : `Unchanged — ${r.input} ${r.after ? "clears" : "misses"} ${r.thresholdAfter}.`;
    } else if (r.after) {
      r.sentence = `Now passes: ${r.input} clears the new bar ${r.thresholdAfter} (was ${r.thresholdBefore}).`;
    } else {
      r.sentence = `Now fails: ${r.input} no longer clears ${r.thresholdAfter} (was ${r.thresholdBefore}).`;
    }
    return r;
  });
}

function AssetImpactRow({
  row,
  change,
  held,
}: {
  row: Row;
  change: RuleChangeSnapshot;
  held: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { asset, before, after, status } = row;
  const reasons = useMemo(
    () => explainAsset(asset, change.before, change.after),
    [asset, change],
  );
  const drivers = reasons.filter((r) => r.before !== r.after);

  return (
    <div className="px-3 py-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{asset.symbol}</span>
            {asset.category === "demo-smallcap" && (
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                DEMO
              </Badge>
            )}
            {held && (
              <Badge variant="outline" className="h-4 border-sky-500/40 px-1 text-[9px] text-sky-300">
                HELD
              </Badge>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {before.matched ? "signal" : "no signal"}
            {" → "}
            {after.matched ? "signal" : "no signal"} · strength {before.strength}% →{" "}
            {after.strength}%
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              status === "gained" && "border-emerald-500/40 text-emerald-300",
              status === "lost" && "border-rose-500/40 text-rose-300",
              status === "same" && "text-muted-foreground",
            )}
          >
            {status === "gained" ? "New signal" : status === "lost" ? "Signal lost" : "Unchanged"}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            Why this changed
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-md border border-border/60 bg-background/50 p-2.5">
          <p className="text-[11px] text-muted-foreground">
            {drivers.length === 0
              ? "No rule check flipped for this asset — the strength delta comes only from threshold slack, not a pass/fail change."
              : `${drivers.length} rule check${drivers.length > 1 ? "s" : ""} flipped: ${drivers
                  .map((d) => d.label.toLowerCase())
                  .join(", ")}.`}
          </p>
          <div className="space-y-1.5">
            {reasons.map((r) => (
              <div
                key={r.key}
                className={cn(
                  "rounded border px-2 py-1.5",
                  r.before !== r.after
                    ? r.after
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-rose-500/30 bg-rose-500/5"
                    : "border-border/50",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium">{r.label}</span>
                  <span
                    className={cn(
                      "font-mono",
                      r.before !== r.after
                        ? r.after
                          ? "text-emerald-300"
                          : "text-rose-300"
                        : "text-muted-foreground",
                    )}
                  >
                    {r.before ? "pass" : "fail"} → {r.after ? "pass" : "fail"}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                  <span>input: {r.input}</span>
                  <span>
                    rule: {r.thresholdBefore}
                    {r.thresholdChanged && (
                      <>
                        {" → "}
                        <span className="text-foreground">{r.thresholdAfter}</span>
                      </>
                    )}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{r.sentence}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Mock/demo data. Explanations are probabilistic signals, not investment advice.
          </p>
        </div>
      )}
    </div>
  );
}


/** Interactive grouped bar chart: signal strength before vs after, per asset. */
function BeforeAfterChart({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const H = 168;
  const PAD_T = 12;
  const PAD_B = 26;
  const plot = H - PAD_T - PAD_B;
  const groupW = 100 / rows.length;
  const barW = Math.min(groupW * 0.34, 6);
  const yOf = (v: number) => PAD_T + plot - (v / 100) * plot;

  const active = hover ? rows[hover.i] : null;

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium">Signal strength by asset</span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-muted-foreground/60" /> Before
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-400" /> After (improved)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-rose-400" /> After (reduced)
          </span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          className="h-44 w-full"
          role="img"
          aria-label="Before and after signal strength per asset"
          onMouseLeave={() => setHover(null)}
        >
          {[0, 25, 50, 75, 100].map((g) => (
            <line
              key={g}
              x1={0}
              x2={100}
              y1={yOf(g)}
              y2={yOf(g)}
              stroke="currentColor"
              strokeWidth={0.3}
              className="text-border/60"
            />
          ))}

          {rows.map((r, i) => {
            const cx = groupW * i + groupW / 2;
            const up = r.after.strength >= r.before.strength;
            return (
              <g
                key={r.asset.symbol}
                onMouseEnter={() => setHover({ i, x: cx, y: 0 })}
              >
                <rect
                  x={groupW * i}
                  y={0}
                  width={groupW}
                  height={H}
                  fill="transparent"
                  className={cn(hover?.i === i && "fill-foreground/[0.04]")}
                />
                <rect
                  x={cx - barW - 0.6}
                  y={yOf(r.before.strength)}
                  width={barW}
                  height={plot - (yOf(r.before.strength) - PAD_T)}
                  rx={0.8}
                  className="fill-muted-foreground/60"
                />
                <rect
                  x={cx + 0.6}
                  y={yOf(r.after.strength)}
                  width={barW}
                  height={plot - (yOf(r.after.strength) - PAD_T)}
                  rx={0.8}
                  className={up ? "fill-emerald-400" : "fill-rose-400"}
                />
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex">
          {rows.map((r, i) => (
            <span
              key={r.asset.symbol}
              style={{ width: `${groupW}%` }}
              className={cn(
                "truncate px-0.5 text-center text-[9px]",
                hover?.i === i ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {r.asset.symbol}
            </span>
          ))}
        </div>

        {active && hover && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-52 -translate-x-1/2 rounded-md border border-border/70 bg-popover/95 p-2 text-[11px] shadow-lg backdrop-blur"
            style={{ left: `${Math.min(Math.max(hover.x, 18), 82)}%` }}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold">{active.asset.symbol}</span>
              <Badge
                variant="outline"
                className={cn(
                  "h-4 px-1 text-[9px]",
                  active.status === "gained" && "border-emerald-500/40 text-emerald-300",
                  active.status === "lost" && "border-rose-500/40 text-rose-300",
                )}
              >
                {active.status === "gained"
                  ? "New signal"
                  : active.status === "lost"
                    ? "Signal lost"
                    : "Unchanged"}
              </Badge>
            </div>
            <div className="font-mono text-muted-foreground">
              {active.before.strength}% → {active.after.strength}%
            </div>
            <div className="mt-1.5 space-y-0.5">
              {(Object.keys(CHECK_LABELS) as (keyof typeof CHECK_LABELS)[]).map((k) => {
                const b = active.before.checks[k];
                const a = active.after.checks[k];
                return (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{CHECK_LABELS[k]}</span>
                    <span
                      className={cn(
                        "font-mono",
                        b !== a ? (a ? "text-emerald-300" : "text-rose-300") : "text-foreground/70",
                      )}
                    >
                      {b ? "pass" : "fail"} → {a ? "pass" : "fail"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="mt-1 text-[10px] text-muted-foreground">
        Hover a bar pair to see which rule checks changed. Mock/demo data.
      </p>
    </div>
  );
}
