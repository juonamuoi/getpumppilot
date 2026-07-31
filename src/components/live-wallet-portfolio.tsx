// Live wallet portfolio — real on-chain balances priced with live market data.
// Read-only: balances come from the browser wallet, prices from CoinGecko.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, RefreshCw, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { fmtPct, fmtUsd } from "@/lib/mock-data";
import { useLivePriceMap } from "@/lib/market-data";
import { useInjectedAccount, useWalletBalances } from "@/lib/wallet-balances";
import { shortAddress } from "@/lib/wallet-scan";

export function LiveWalletPortfolio() {
  const { address, available, connect } = useInjectedAccount();
  const { data, isFetching, isError, error, refetch, dataUpdatedAt } =
    useWalletBalances(address);
  const prices = useLivePriceMap();

  const rows = (data?.balances ?? []).map((b) => {
    const live = prices[b.symbol];
    const price = b.usdPeg ?? live?.price ?? null;
    return {
      ...b,
      price,
      value: price != null ? price * b.amount : null,
      change24h: b.usdPeg ? 0 : (live?.change24h ?? null),
      priced: price != null,
      livePriced: !b.usdPeg && Boolean(live),
    };
  });

  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const dayChange = rows.reduce(
    (s, r) =>
      r.value != null && r.change24h != null
        ? s + r.value - r.value / (1 + r.change24h / 100)
        : s,
    0,
  );
  const dayPct = total - dayChange > 0 ? (dayChange / (total - dayChange)) * 100 : 0;
  const unpriced = rows.filter((r) => !r.priced).length;

  const onConnect = async () => {
    try {
      const next = await connect();
      if (next) toast.success(`Wallet connected read-only — ${shortAddress(next)}`);
    } catch {
      toast.error("Wallet connection was rejected");
    }
  };

  return (
    <Card className="border-emerald-500/25 bg-emerald-500/[0.04]">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-emerald-400" /> Wallet portfolio
          <Badge
            variant="outline"
            className="border-emerald-500/40 text-[10px] uppercase tracking-wide text-emerald-300"
          >
            Live wallet · real prices
          </Badge>
          <Badge
            variant="outline"
            className="border-amber-500/40 text-[10px] uppercase tracking-wide text-amber-300"
          >
            Read-only · trading disabled
          </Badge>
        </CardTitle>
        {address && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {!address && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect a browser wallet to price your real holdings with live market data. This
              is a read-only balance read — no signing, no approvals, and never a seed phrase.
            </p>
            {available ? (
              <Button
                onClick={() => void onConnect()}
                className="bg-emerald-500 text-black hover:bg-emerald-400"
              >
                Connect wallet (read-only)
              </Button>
            ) : (
              <p className="text-xs text-amber-300">
                No browser wallet detected. Install MetaMask, Rabby or Coinbase Wallet, then
                reload this page.
              </p>
            )}
          </div>
        )}

        {address && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{shortAddress(address)}</span>
              {data?.chainName && <span>· {data.chainName}</span>}
              <span>· read-only</span>
              {dataUpdatedAt ? (
                <span>· updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
              ) : null}
            </div>

            {isError && (
              <p className="text-xs text-amber-300">
                Couldn't read balances — {(error as Error)?.message ?? "wallet unavailable"}.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Wallet value
                </div>
                <div className="mt-1 font-mono text-xl font-bold">{fmtUsd(total)}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  24h change
                </div>
                <div
                  className={`mt-1 font-mono text-xl font-bold ${
                    dayChange >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmtUsd(dayChange)}
                  <span className="ml-1 text-xs">{fmtPct(dayPct)}</span>
                </div>
              </div>
            </div>

            {isFetching && rows.length === 0 && (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading on-chain balances…
              </div>
            )}

            {!isFetching && rows.length === 0 && !isError && (
              <p className="text-sm text-muted-foreground">
                No tracked balances on {data?.chainName ?? "this network"}. Switch networks in
                your wallet to see other holdings.
              </p>
            )}

            <div className="space-y-2">
              {rows
                .slice()
                .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
                .map((r) => (
                  <div
                    key={`${r.symbol}-${r.kind}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.symbol}</span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] uppercase ${
                            r.livePriced
                              ? "border-emerald-500/30 text-emerald-300"
                              : "border-border/60 text-muted-foreground"
                          }`}
                        >
                          {r.livePriced ? "live price" : r.usdPeg ? "USD peg" : "unpriced"}
                        </Badge>
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {r.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                        {r.symbol}
                        {r.price != null ? ` · ${fmtUsd(r.price)}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold">
                        {r.value != null ? fmtUsd(r.value) : "—"}
                      </div>
                      {r.change24h != null && !r.usdPeg && (
                        <div
                          className={`font-mono text-[11px] ${
                            r.change24h >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {fmtPct(r.change24h)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {unpriced > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {unpriced} holding{unpriced > 1 ? "s" : ""} has no live price feed and is
                excluded from the totals.
              </p>
            )}
          </>
        )}

        <p className="flex items-start gap-1.5 pt-1 text-[10px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
          Balances are read live from your wallet; prices come from the live CoinGecko feed.
          Trading below this card remains paper-only — nothing here can move your funds.
        </p>
      </CardContent>
    </Card>
  );
}
