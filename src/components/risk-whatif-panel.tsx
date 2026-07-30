import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { usePaper } from "@/lib/paper-store";
import { fmtUsd, getAsset } from "@/lib/mock-data";
import { SlidersHorizontal, RotateCcw, ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

/**
 * What-if panel: move the stop-loss, take-profit and max-position-size dials
 * and see — per holding — how the dollar amount at risk and the take-profit
 * target would change before committing anything to the saved risk settings.
 */

type Row = {
  symbol: string;
  price: number;
  value: number;
  whatIfValue: number;
  trimmed: boolean;
  stopNow: number;
  stopNext: number;
  targetNow: number;
  targetNext: number;
  riskNow: number;
  riskNext: number;
  rewardNext: number;
};

export function RiskWhatIfPanel() {
  const { equity, positions, risk, setRisk } = usePaper();

  const [stopLossPct, setStopLossPct] = useState(risk.stopLossPct);
  const [takeProfitPct, setTakeProfitPct] = useState(risk.takeProfitPct);
  const [maxPositionPct, setMaxPositionPct] = useState(risk.maxPositionPct);
  const [applySizing, setApplySizing] = useState(true);

  const dirty =
    stopLossPct !== risk.stopLossPct ||
    takeProfitPct !== risk.takeProfitPct ||
    maxPositionPct !== risk.maxPositionPct;

  const maxPositionUsd = (equity * maxPositionPct) / 100;
  const maxDailyLossUsd = (equity * risk.maxDailyLossPct) / 100;

  const rows = useMemo<Row[]>(() => {
    return positions
      .map((p) => {
        const a = getAsset(p.symbol);
        if (!a) return null;
        const value = a.price * p.qty;
        // "Trim to limit" caps the simulated exposure at the what-if max size.
        const whatIfValue = applySizing ? Math.min(value, maxPositionUsd) : value;
        return {
          symbol: p.symbol,
          price: a.price,
          value,
          whatIfValue,
          trimmed: whatIfValue < value - 0.005,
          stopNow: a.price * (1 - risk.stopLossPct / 100),
          stopNext: a.price * (1 - stopLossPct / 100),
          targetNow: a.price * (1 + risk.takeProfitPct / 100),
          targetNext: a.price * (1 + takeProfitPct / 100),
          riskNow: (value * risk.stopLossPct) / 100,
          riskNext: (whatIfValue * stopLossPct) / 100,
          rewardNext: (whatIfValue * takeProfitPct) / 100,
        } satisfies Row;
      })
      .filter((r): r is Row => r !== null)
      .sort((a, b) => b.value - a.value);
  }, [positions, applySizing, maxPositionUsd, risk.stopLossPct, risk.takeProfitPct, stopLossPct, takeProfitPct]);

  const totalRiskNow = rows.reduce((s, r) => s + r.riskNow, 0);
  const totalRiskNext = rows.reduce((s, r) => s + r.riskNext, 0);
  const totalRewardNext = rows.reduce((s, r) => s + r.rewardNext, 0);
  const riskDelta = totalRiskNext - totalRiskNow;
  const rMultiple = stopLossPct > 0 ? takeProfitPct / stopLossPct : 0;
  const capBreach = totalRiskNext > maxDailyLossUsd;

  function reset() {
    setStopLossPct(risk.stopLossPct);
    setTakeProfitPct(risk.takeProfitPct);
    setMaxPositionPct(risk.maxPositionPct);
  }

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4 text-emerald-400" /> What-if: stop &amp; sizing
          <span className="text-xs font-normal text-muted-foreground">
            — nothing is saved until you apply
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset} disabled={!dirty}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => setRisk({ ...risk, stopLossPct, takeProfitPct, maxPositionPct })}
          >
            Apply to risk controls
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Dial
            label="Stop-loss"
            value={`-${stopLossPct}%`}
            baseline={`now -${risk.stopLossPct}%`}
            min={1}
            max={40}
            current={stopLossPct}
            onChange={setStopLossPct}
          />
          <Dial
            label="Take-profit"
            value={`+${takeProfitPct}%`}
            baseline={`now +${risk.takeProfitPct}%`}
            min={2}
            max={120}
            current={takeProfitPct}
            onChange={setTakeProfitPct}
          />
          <Dial
            label="Max position size"
            value={`${maxPositionPct}%`}
            baseline={`${fmtUsd(maxPositionUsd)} per holding`}
            min={1}
            max={100}
            current={maxPositionPct}
            onChange={setMaxPositionPct}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2">
          <div className="text-xs">
            <div className="font-medium">Simulate trimming oversized holdings</div>
            <div className="text-[10px] text-muted-foreground">
              Caps each holding at the what-if max size before computing risk.
            </div>
          </div>
          <Switch checked={applySizing} onCheckedChange={setApplySizing} />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Dollar risk now" value={fmtUsd(totalRiskNow)} sub="all stops triggered" />
          <Stat
            label="Dollar risk what-if"
            value={fmtUsd(totalRiskNext)}
            sub={`${riskDelta >= 0 ? "+" : ""}${fmtUsd(riskDelta)} vs. now`}
            tone={riskDelta > 0 ? "warn" : riskDelta < 0 ? "good" : "neutral"}
          />
          <Stat
            label="Upside at target"
            value={fmtUsd(totalRewardNext)}
            sub={`${rMultiple.toFixed(1)}R reward-to-risk`}
          />
          <Stat
            label="Daily loss cap"
            value={fmtUsd(maxDailyLossUsd)}
            sub={capBreach ? "what-if risk exceeds cap" : "what-if risk inside cap"}
            tone={capBreach ? "warn" : "good"}
          />
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Holding</th>
                  <th className="pb-2 text-right font-medium">Exposure</th>
                  <th className="pb-2 text-right font-medium">Stop price</th>
                  <th className="pb-2 text-right font-medium">Target price</th>
                  <th className="pb-2 text-right font-medium">$ at risk</th>
                  <th className="pb-2 text-right font-medium">$ at target</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => {
                  const delta = r.riskNext - r.riskNow;
                  return (
                    <tr key={r.symbol} className="border-t border-border/40 align-top">
                      <td className="py-2 font-sans font-medium">
                        <span className="flex flex-wrap items-center gap-2">
                          {r.symbol}
                          {r.trimmed && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 text-[10px] text-amber-300"
                            >
                              trim to limit
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <Pair now={fmtUsd(r.value)} next={fmtUsd(r.whatIfValue)} />
                      </td>
                      <td className="py-2 text-right">
                        <Pair now={fmtUsd(r.stopNow)} next={fmtUsd(r.stopNext)} />
                      </td>
                      <td className="py-2 text-right">
                        <Pair now={fmtUsd(r.targetNow)} next={fmtUsd(r.targetNext)} />
                      </td>
                      <td className="py-2 text-right">
                        <Pair now={fmtUsd(r.riskNow)} next={fmtUsd(r.riskNext)} />
                        <div
                          className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
                            delta > 0 ? "text-amber-300" : delta < 0 ? "text-emerald-300" : "text-muted-foreground"
                          }`}
                        >
                          {delta > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : delta < 0 ? (
                            <TrendingDown className="h-3 w-3" />
                          ) : null}
                          {delta >= 0 ? "+" : ""}
                          {fmtUsd(delta)}
                        </div>
                      </td>
                      <td className="py-2 text-right text-emerald-300">{fmtUsd(r.rewardNext)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No open holdings yet — open a paper trade to model stop and sizing changes.
          </p>
        )}

        <p className="text-[10px] text-muted-foreground">
          Simulation only, using mock / demo prices and your saved risk settings. Stops are not
          guaranteed fills — gaps and slippage can produce larger losses. Not financial advice.
        </p>
      </CardContent>
    </Card>
  );
}

function Dial({
  label,
  value,
  baseline,
  min,
  max,
  current,
  onChange,
}: {
  label: string;
  value: string;
  baseline: string;
  min: number;
  max: number;
  current: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="font-mono text-lg font-semibold">{value}</span>
      </div>
      <Slider
        className="mt-3"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={[current]}
        onValueChange={([v]) => onChange(v)}
      />
      <div className="mt-1.5 text-[10px] text-muted-foreground">{baseline}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
      <div className={`mt-0.5 text-[10px] ${toneClass}`}>{sub}</div>
    </div>
  );
}

function Pair({ now, next }: { now: string; next: string }) {
  const changed = now !== next;
  return (
    <span className="flex items-center justify-end gap-1">
      <span className={changed ? "text-muted-foreground line-through" : "text-muted-foreground"}>
        {now}
      </span>
      {changed && (
        <>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-semibold">{next}</span>
        </>
      )}
    </span>
  );
}
