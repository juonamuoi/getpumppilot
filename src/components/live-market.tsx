// Live crypto market widget — powered by CoinGecko public API.
// Clearly labelled; falls back to a subtle message on failure.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/sparkline";
import { useLivePrices } from "@/lib/market-data";
import { fmtPct, fmtUsd } from "@/lib/mock-data";
import { Radio, Loader2, WifiOff } from "lucide-react";

export function LiveMarket() {
  const { data, isLoading, isError, dataUpdatedAt } = useLivePrices();

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4 text-emerald-400" /> Live market
          <Badge
            variant="outline"
            className="border-emerald-500/30 text-[10px] text-emerald-300"
          >
            CoinGecko · live
          </Badge>
        </CardTitle>
        <span className="text-[10px] text-muted-foreground">
          {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && !data && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching live prices…
          </div>
        )}
        {isError && !data && (
          <div className="flex items-center gap-2 py-4 text-sm text-amber-300">
            <WifiOff className="h-4 w-4" /> Live feed unavailable. Showing demo values elsewhere.
          </div>
        )}
        {data?.map((p) => {
          const pos = p.change24h >= 0;
          return (
            <div
              key={p.symbol}
              className="grid grid-cols-[minmax(0,1fr)_80px_auto] items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{p.symbol}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {fmtUsd(p.price)}
                </div>
              </div>
              <div className="h-8">
                <Sparkline data={p.sparkline} positive={pos} />
              </div>
              <div
                className={`font-mono text-xs ${pos ? "text-emerald-400" : "text-rose-400"}`}
              >
                {fmtPct(p.change24h)}
              </div>
            </div>
          );
        })}
        <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
          Live prices are read-only reference data. Paper trading executes against demo
          prices in the sandbox — no orders leave your browser.
        </p>
      </CardContent>
    </Card>
  );
}
