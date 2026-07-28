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
import { ArrowRight, Sparkles, X } from "lucide-react";
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

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/[0.04]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-300" />
            Impact of your saved rule change
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss}>
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss impact preview</span>
          </Button>
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
          <p className="text-[11px] text-muted-foreground">
            Mock/demo data. Signals are probabilistic — not investment advice.
          </p>
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

        {rows.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No assets in this scope yet — open a paper position or pick another scope.
          </div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
            {rows.map(({ asset, before, after, status }) => (
              <div
                key={asset.symbol}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{asset.symbol}</span>
                    {asset.category === "demo-smallcap" && (
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">
                        DEMO
                      </Badge>
                    )}
                    {held.has(asset.symbol) && (
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
              </div>
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
