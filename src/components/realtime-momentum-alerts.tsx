// Dashboard card: realtime momentum alerts.
// Watches ticking momentum scores against the saved scanner rules and the
// user's per-asset momentum alerts, honouring the cooldown, and records every
// firing into the shared alert delivery history.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Activity, ArrowDownRight, ArrowUpRight, Bell, BellOff, Pause, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePaper, type AlertDelivery } from "@/lib/paper-store";
import { useLiveMomentum, type LiveMomentum } from "@/lib/live-momentum";
import { scoreColor } from "@/components/momentum";

const TICK_MS = 5000;

type Fired = { id: string; ts: number; symbol: string; score: number; rule: string };

export function RealtimeMomentumAlerts() {
  const { scannerRules, alerts, pushDeliveries } = usePaper();
  const [enabled, setEnabled] = useState(true);
  const [fired, setFired] = useState<Fired[]>([]);
  const lastFiredRef = useRef<Record<string, number>>({});
  const { rows, ts } = useLiveMomentum({ enabled, intervalMs: TICK_MS });

  useEffect(() => {
    if (!enabled) return;

    const channels: AlertDelivery["channel"][] = [];
    if (scannerRules.channels.inApp) channels.push("in-app");
    if (scannerRules.channels.email) channels.push("email");
    if (scannerRules.channels.push) channels.push("push");

    const cooldownMs = Math.max(0, scannerRules.cooldownMinutes) * 60_000;
    const now = Date.now();
    const hits: { row: LiveMomentum; rule: string }[] = [];

    for (const row of rows) {
      if (!scannerRules.includeMajors && row.category === "major") continue;
      if (!scannerRules.includeDemoSmallCaps && row.category === "demo-smallcap") continue;

      // Per-asset momentum alerts the user configured on /alerts.
      const userAlert = alerts.find(
        (a) => a.active && a.kind === "momentum-above" && a.symbol === row.symbol,
      );
      const userHit = userAlert && row.score >= userAlert.value && row.prevScore < userAlert.value;

      // Scanner rules — fire on the upward crossing only.
      const scannerHit =
        row.score >= scannerRules.minMomentum &&
        row.prevScore < scannerRules.minMomentum &&
        row.volumeScore >= scannerRules.minVolumeScore &&
        row.volatility <= scannerRules.maxVolatility &&
        row.change24h >= scannerRules.min24hChangePct;

      if (!userHit && !scannerHit) continue;

      const key = `${row.symbol}:${userHit ? "user" : "scanner"}`;
      if (now - (lastFiredRef.current[key] ?? 0) < cooldownMs) continue;
      lastFiredRef.current[key] = now;

      hits.push({
        row,
        rule: userHit
          ? `Your alert · ${row.symbol} momentum ≥ ${userAlert!.value}`
          : `Scanner · Momentum ≥ ${scannerRules.minMomentum} · Vol ≥ ${scannerRules.minVolumeScore} · 24h ≥ ${scannerRules.min24hChangePct}%`,
      });
    }

    if (hits.length === 0) return;

    const deliveries: AlertDelivery[] = hits.map(({ row, rule }, i) => ({
      id: `rt-${now}-${row.symbol}-${i}`,
      ts: now,
      symbol: row.symbol,
      rule,
      channel: channels.length ? channels[i % channels.length] : "in-app",
      status: channels.length ? "delivered" : "muted",
      detail: `Realtime: ${row.symbol} momentum ${row.score} (${row.delta >= 0 ? "+" : ""}${row.delta} this tick), 24h ${row.change24h >= 0 ? "+" : ""}${row.change24h.toFixed(2)}%${row.liveBacked ? "" : " · demo data"}`,
    }));

    pushDeliveries(deliveries);
    setFired((prev) =>
      [
        ...hits.map(({ row, rule }, i) => ({
          id: `rt-${now}-${row.symbol}-${i}`,
          ts: now,
          symbol: row.symbol,
          score: row.score,
          rule,
        })),
        ...prev,
      ].slice(0, 12),
    );

    if (scannerRules.channels.inApp) {
      for (const { row, rule } of hits.slice(0, 3)) {
        toast.success(`${row.symbol} momentum ${row.score}`, { description: rule });
      }
    }
    // Re-evaluate on every tick only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts, enabled]);

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-emerald-400" /> Realtime momentum alerts
            <Badge
              variant="outline"
              className={
                enabled
                  ? "border-emerald-500/30 text-[10px] text-emerald-300"
                  : "border-border/60 text-[10px] text-muted-foreground"
              }
            >
              {enabled ? "Live · 5s" : "Paused"}
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Fires on upward crossings of your scanner rules and per-asset alerts.
            Cooldown {scannerRules.cooldownMinutes}m.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enable realtime momentum alerts"
          />
          {enabled ? (
            <Pause className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Play className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          {rows.slice(0, 5).map((r) => {
            const up = r.delta >= 0;
            return (
              <Link
                key={r.symbol}
                to="/asset/$symbol"
                params={{ symbol: r.symbol.toLowerCase() }}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 truncate text-sm font-semibold">
                    {r.symbol}
                    {!r.liveBacked && (
                      <Badge variant="outline" className="border-amber-500/30 text-[9px] text-amber-300">
                        DEMO
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{r.name}</div>
                </div>
                <div className={`font-mono text-sm font-bold ${scoreColor(r.score)}`}>{r.score}</div>
                <div
                  className={`flex w-14 items-center justify-end gap-0.5 font-mono text-[11px] ${up ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {up ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {up ? "+" : ""}
                  {r.delta}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {fired.length ? (
                <Bell className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              Recent triggers
            </div>
            <Button asChild variant="ghost" size="sm" className="h-6 text-[11px]">
              <Link to="/alerts" search={{ tab: "rules", audit: undefined }}>Manage rules</Link>
            </Button>
          </div>
          {fired.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {enabled
                ? "Watching for momentum crossings… nothing has triggered yet."
                : "Feed paused. Turn it on to watch for momentum crossings."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {fired.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 text-[11px]">
                  <span className="min-w-0">
                    <span className="font-semibold">{f.symbol}</span>{" "}
                    <span className="font-mono">{f.score}</span>{" "}
                    <span className="text-muted-foreground">— {f.rule}</span>
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {new Date(f.ts).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Major-asset scores blend live reference prices with the demo momentum model; DEMO
          small-caps are fictional and fully simulated. Momentum scores are probabilistic
          signals, not investment advice — you can lose all capital.
        </p>
      </CardContent>
    </Card>
  );
}
