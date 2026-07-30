import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { BellRing, TrendingDown, TrendingUp } from "lucide-react";
import { fmtUsd } from "@/lib/mock-data";
import { useRiskHits } from "@/lib/position-risk-watch";

/** Recent stop-loss / take-profit trigger log for paper holdings. */
export function RiskHitsCard() {
  const { hits, clear } = useRiskHits();

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-amber-400" /> Stop &amp; target alerts
          <span className="text-xs font-normal text-muted-foreground">— simulated prices</span>
        </CardTitle>
        <div className="flex items-center gap-3">
          {hits.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>
              Clear
            </Button>
          )}
          <Link to="/risk" className="text-xs text-emerald-300 hover:underline">
            Adjust levels →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {hits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No holdings have reached their stop-loss or take-profit level yet. Alerts appear here
            and as a toast the moment a simulated price crosses one.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {hits.slice(0, 8).map((h) => {
              const up = h.kind === "take-profit";
              return (
                <div key={h.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {up ? (
                      <TrendingUp className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <TrendingDown className="h-4 w-4 shrink-0 text-rose-400" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {h.symbol}{" "}
                        <Badge
                          variant="outline"
                          className={
                            up
                              ? "border-emerald-500/40 text-[10px] text-emerald-300"
                              : "border-rose-500/40 text-[10px] text-rose-300"
                          }
                        >
                          {up ? "take-profit" : "stop-loss"}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtUsd(h.price)} vs level {fmtUsd(h.level)} ·{" "}
                        {new Date(h.at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`shrink-0 text-right text-sm font-medium ${
                      h.pnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {h.pnlUsd >= 0 ? "+" : ""}
                    {fmtUsd(h.pnlUsd)}
                    <div className="text-[11px] font-normal text-muted-foreground">
                      {h.pnlPct >= 0 ? "+" : ""}
                      {h.pnlPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
