import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePaper } from "@/lib/paper-store";
import { fmtUsd, getAsset } from "@/lib/mock-data";
import { ShieldCheck, AlertTriangle, Check, FileDown, Loader2 } from "lucide-react";
import { RiskPresetSwitcher } from "@/components/risk-preset-switcher";
import { useRiskPresets } from "@/lib/risk-presets";
import { downloadRiskSummaryPdf } from "@/lib/risk-summary-pdf";


/**
 * Portfolio-level risk guidance: how big a new position may be, where the
 * default stop-loss / take-profit sit, and which open holdings already exceed
 * the configured max position size.
 */
export function RiskGuidanceCard() {
  const { equity, cash, positions, risk } = usePaper();
  const { presets, activeId } = useRiskPresets();
  const [exporting, setExporting] = useState(false);


  const maxPositionUsd = (equity * risk.maxPositionPct) / 100;
  const maxDailyLossUsd = (equity * risk.maxDailyLossPct) / 100;
  // Loss taken if a full-size position is stopped out at the default stop.
  const riskPerTradeUsd = (maxPositionUsd * risk.stopLossPct) / 100;
  const rMultiple = risk.stopLossPct > 0 ? risk.takeProfitPct / risk.stopLossPct : 0;

  const rows = positions
    .map((p) => {
      const a = getAsset(p.symbol);
      if (!a) return null;
      const value = a.price * p.qty;
      const pct = equity > 0 ? (value / equity) * 100 : 0;
      return {
        symbol: p.symbol,
        value,
        pct,
        over: pct > risk.maxPositionPct,
        stopPrice: a.price * (1 - risk.stopLossPct / 100),
        targetPrice: a.price * (1 + risk.takeProfitPct / 100),
        atRisk: (value * risk.stopLossPct) / 100,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.pct - a.pct);

  const totalAtRisk = rows.reduce((s, r) => s + r.atRisk, 0);
  const breaches = rows.filter((r) => r.over).length;
  const dailyLossBreach = totalAtRisk > maxDailyLossUsd;

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-emerald-400" /> Risk controls
          <span className="text-xs font-normal text-muted-foreground">
            — sizing &amp; stop-loss guidance
          </span>
        </CardTitle>
        <Link to="/risk" className="text-xs text-emerald-300 hover:underline">
          Adjust →
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Preset</span>
          <RiskPresetSwitcher compact />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

          <Guide
            label="Max position size"
            value={fmtUsd(maxPositionUsd)}
            sub={`${risk.maxPositionPct}% of ${fmtUsd(equity)} equity`}
          />
          <Guide
            label="Default stop-loss"
            value={`-${risk.stopLossPct}%`}
            sub={`≈ ${fmtUsd(riskPerTradeUsd)} risked at full size`}
          />
          <Guide
            label="Take-profit"
            value={`+${risk.takeProfitPct}%`}
            sub={`${rMultiple.toFixed(1)}R reward vs. your stop`}
          />
          <Guide
            label="Daily loss cap"
            value={fmtUsd(maxDailyLossUsd)}
            sub={`${risk.maxDailyLossPct}% of equity per day`}
          />
        </div>

        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
            breaches > 0 || dailyLossBreach
              ? "border-amber-500/30 bg-amber-500/5 text-amber-200"
              : "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
          }`}
        >
          {breaches > 0 || dailyLossBreach ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>
            {breaches > 0
              ? `${breaches} position${breaches > 1 ? "s" : ""} exceed your ${risk.maxPositionPct}% size limit — trim to about ${fmtUsd(maxPositionUsd)} each.`
              : dailyLossBreach
                ? `If every stop triggered today you'd lose ${fmtUsd(totalAtRisk)}, above your ${fmtUsd(maxDailyLossUsd)} daily cap.`
                : `All positions are inside your size limit. Combined stop-out risk is ${fmtUsd(totalAtRisk)} of a ${fmtUsd(maxDailyLossUsd)} daily cap.`}
          </span>
        </div>

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Holding</th>
                  <th className="pb-2 text-right font-medium">Weight</th>
                  <th className="pb-2 text-right font-medium">Stop</th>
                  <th className="pb-2 text-right font-medium">Target</th>
                  <th className="pb-2 text-right font-medium">At risk</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={r.symbol} className="border-t border-border/40">
                    <td className="py-2 font-sans font-medium">
                      <span className="flex items-center gap-2">
                        {r.symbol}
                        {r.over && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-[10px] text-amber-300"
                          >
                            over limit
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className={`py-2 text-right ${r.over ? "text-amber-300" : ""}`}>
                      {r.pct.toFixed(1)}%
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {fmtUsd(r.stopPrice)}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {fmtUsd(r.targetPrice)}
                    </td>
                    <td className="py-2 text-right">{fmtUsd(r.atRisk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Guidance only, based on mock / demo prices and your saved risk settings. Not financial
          advice — momentum signals are probabilistic and you can lose all invested capital.
        </p>
      </CardContent>
    </Card>
  );
}

function Guide({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
