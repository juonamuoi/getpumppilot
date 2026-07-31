// Live wallet portfolio — real on-chain balances priced with live market data.
// Read-only: balances come from the browser wallet, prices from CoinGecko.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, RefreshCw, Loader2, ShieldCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import { fmtPct, fmtUsd } from "@/lib/mock-data";
import { useLivePriceMap, useLivePrices } from "@/lib/market-data";
import { useInjectedAccount, useWalletBalances } from "@/lib/wallet-balances";
import { shortAddress } from "@/lib/wallet-scan";
import { WalletAllocationChart } from "@/components/wallet-allocation-chart";
import { WalletValueHistoryChart } from "@/components/wallet-value-history-chart";

function freshness(ts: number | undefined): string {
  if (!ts) return "not yet fetched";
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export function LiveWalletPortfolio() {
  const { address, available, connect } = useInjectedAccount();
  const { data, isFetching, isError, error, refetch, dataUpdatedAt } =
    useWalletBalances(address);
  const prices = useLivePriceMap();
  const { dataUpdatedAt: priceUpdatedAt, isFetching: pricesFetching } = useLivePrices();


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
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Read-only. No trades can be placed.
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Read-only connection.</span> PumpPilot
              only reads balances. It never requests a seed phrase, never asks you to sign
              transactions, and cannot move funds.
            </li>
            <li>
              <span className="font-medium text-foreground">Prices are indicators, not
              guarantees.</span> Momentum scores and signals are probabilistic estimates from
              delayed public market data — they are not price predictions or financial advice.
            </li>
            <li>
              <span className="font-medium text-foreground">Trading is disabled.</span> Every order
              in this app is simulated paper trading. No signal here executes against your real
              wallet.
            </li>
          </ul>
        </div>

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

            <WalletValueHistoryChart
              address={address}
              total={total}
              ready={rows.length > 0 && !isFetching}
            />

            <WalletAllocationChart
              items={rows
                .filter((r) => r.value != null && r.value > 0)
                .map((r) => ({ symbol: r.symbol, value: r.value as number }))}
            />


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
                    key={`${r.symbol}-${r.kind}-${r.address ?? "native"}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.symbol}</span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] uppercase ${
                            r.livePriced
                              ? "border-emerald-500/30 text-emerald-300"
                              : r.usdPeg
                                ? "border-border/60 text-muted-foreground"
                                : "border-amber-500/40 text-amber-300"
                          }`}
                        >
                          {r.livePriced ? "live price" : r.usdPeg ? "USD peg" : "no live price"}
                        </Badge>
                        {r.discovered && (
                          <Badge
                            variant="outline"
                            className="border-sky-500/30 text-[9px] uppercase text-sky-300"
                            title={r.address}
                          >
                            auto-detected
                          </Badge>
                        )}
                      </div>

                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {r.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                        {r.symbol}
                        {r.price != null ? ` · ${fmtUsd(r.price)}` : ""}
                      </div>
                      <div
                        className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground"
                        title={
                          r.livePriced && priceUpdatedAt
                            ? `CoinGecko · fetched ${new Date(priceUpdatedAt).toLocaleString()}`
                            : undefined
                        }
                      >
                        <Clock className="h-2.5 w-2.5 shrink-0" />
                        {r.livePriced ? (
                          <span>
                            Source: CoinGecko · updated{" "}
                            {pricesFetching ? "refreshing…" : freshness(priceUpdatedAt)}
                          </span>
                        ) : r.usdPeg ? (
                          <span>Source: stablecoin USD peg (fixed $1.00) · no feed needed</span>
                        ) : (
                          <span>Source: none · no live feed for this asset</span>
                        )}
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
              <p className="text-[11px] text-amber-300/90">
                {unpriced} holding{unpriced > 1 ? "s" : ""} has no live price feed — shown for
                visibility only and excluded from wallet value, 24h change and allocation.
                Auto-detected tokens can be spam airdrops; verify the contract before trusting
                the name.
              </p>
            )}

            {data?.discoveryFailed && (
              <p className="text-[11px] text-muted-foreground">
                Auto-detection of extra ERC-20s couldn't run on this network (your wallet's RPC
                blocked the log scan). Tracked tokens are still shown.
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
