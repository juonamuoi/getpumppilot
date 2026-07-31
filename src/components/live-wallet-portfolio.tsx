// Live wallet portfolio — real on-chain balances priced with live market data.
// Read-only: balances come from the browser wallet, prices from CoinGecko.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Clock,
  Download,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  FILTER_LABELS,
  SORT_LABELS,
  applyHoldingControls,
  isSpamLikely,
  type HoldingFilter,
  type HoldingSort,
} from "@/lib/holding-filters";
import {
  downloadCsv,
  holdingsCsvFilename,
  holdingsToCsv,
} from "@/lib/wallet-export";
import { toast } from "sonner";
import { fmtPct, fmtUsd } from "@/lib/mock-data";
import { LIVE_SYMBOLS, useLivePriceMap, useLivePrices } from "@/lib/market-data";
import { useInjectedAccount, useWalletBalances, forceRescan } from "@/lib/wallet-balances";
import {
  useSyncInterval,
  SYNC_INTERVAL_OPTIONS,
  type SyncIntervalValue,
} from "@/lib/sync-interval";
import { shortAddress } from "@/lib/wallet-scan";
import { WalletAllocationChart } from "@/components/wallet-allocation-chart";
import { LivePaperAllocationCompare } from "@/components/live-paper-allocation-compare";
import { WalletValueHistoryChart } from "@/components/wallet-value-history-chart";
import { DataSourcesDialog } from "@/components/data-sources-dialog";
import { PriceSparkline, SparklineStats } from "@/components/price-sparkline";
import { HoldingSparklineDrawer } from "@/components/holding-sparkline-drawer";
import { SparklineCompare } from "@/components/sparkline-compare";
import {
  SPARK_WINDOW_OPTIONS,
  sliceSparkline,
  useSparkWindow,
} from "@/lib/sparkline-window";
import { HoldingInfoDrawer } from "@/components/holding-info-drawer";
import { SpamListManager } from "@/components/spam-list-manager";
import { useSpamLists } from "@/lib/spam-lists";
import { evaluateSpam, type SpamInput } from "@/lib/spam-signals";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEffect, useState } from "react";
import {
  STALE_OPTIONS,
  describeAge,
  isStale,
  useStaleThresholdMs,
} from "@/lib/price-freshness";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";

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
  const { value: syncValue, setValue: setSyncValue, ms: syncMs } = useSyncInterval();
  const { data, isFetching, isError, error, refetch, dataUpdatedAt } =
    useWalletBalances(address, syncMs);
  const prices = useLivePriceMap();
  const {
    dataUpdatedAt: priceUpdatedAt,
    isFetching: pricesFetching,
    isError: pricesError,
    error: priceError,
    refetch: refetchPrices,
  } = useLivePrices(syncMs);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HoldingFilter>("all");
  const [sort, setSort] = useState<HoldingSort>("value-desc");
  const [hideSpam, setHideSpam] = useState(true);
  const [pricedFirst, setPricedFirst] = useState(true);
  const [staleMs, setStaleMs] = useStaleThresholdMs();
  const { lists: spamLists } = useSpamLists();
  const [rescanning, setRescanning] = useState(false);

  const syncing = rescanning || isFetching || pricesFetching;
  // Last successful sync = the older of the two feeds, so it never overstates.
  const lastSyncAt =
    dataUpdatedAt && priceUpdatedAt
      ? Math.min(dataUpdatedAt, priceUpdatedAt)
      : dataUpdatedAt || priceUpdatedAt || 0;

  /** Manual full sync: drop the cached log scan, re-detect ERC-20s, re-price. */
  const onRefreshAll = async () => {
    setRescanning(true);
    try {
      await forceRescan(address);
      await Promise.all([refetch(), refetchPrices()]);
      toast.success("Wallet re-scanned and prices refreshed");
    } catch {
      toast.error("Refresh failed — check your wallet connection");
    } finally {
      setRescanning(false);
    }
  };

  // Re-evaluate freshness on a timer so the warning appears without a refetch.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const { value: sparkWindow, setValue: setSparkWindow, config: sparkConfig } =
    useSparkWindow();

  // Compare mode: pick up to two holdings and overlay their sparklines.
  const [compareMode, setCompareMode] = useState(false);
  const [comparePicks, setComparePicks] = useState<string[]>([]);
  const toggleCompare = (symbol: string) =>
    setComparePicks((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol].slice(-2),
    );


  const feedStale = isStale(priceUpdatedAt, staleMs, now);

  const rows = (data?.balances ?? []).map((b) => {
    const live = prices[b.symbol];
    const price = b.usdPeg ?? live?.price ?? null;
    const livePriced = !b.usdPeg && Boolean(live);
    // Tracked by the live feed but no price came back -> the fetch failed
    // or the provider omitted it. Distinct from assets with no feed at all.
    const failed =
      !b.usdPeg && !live && (LIVE_SYMBOLS as readonly string[]).includes(b.symbol);
    // USD-peg holdings never go stale; live-feed holdings do.
    const stale = livePriced && feedStale;
    return {
      ...b,
      price,
      value: price != null ? price * b.amount : null,
      change24h: b.usdPeg ? 0 : (live?.change24h ?? null),
      sparkline: sliceSparkline(live?.sparkline7d ?? live?.sparkline ?? [], sparkWindow),
      priced: price != null,
      livePriced,

      failed,
      stale,
      // Excluded from totals while stale, failed or unpriced.
      counted: price != null && !stale,
    };
  });

  const comparable = rows.filter((r) => r.sparkline.length > 1);
  const comparePair = comparePicks
    .map((s) => comparable.find((r) => r.symbol === s))
    .filter((r): r is (typeof comparable)[number] => Boolean(r));



  const spamCount = rows.filter((r) => isSpamLikely(r, spamLists)).length;
  const visibleRows = applyHoldingControls(rows, {
    query,
    filter,
    sort,
    hideSpam,
    pricedFirst,
    lists: spamLists,
  });

  const total = rows.reduce((s, r) => s + (r.counted ? (r.value ?? 0) : 0), 0);
  const dayChange = rows.reduce(
    (s, r) =>
      r.counted && r.value != null && r.change24h != null
        ? s + r.value - r.value / (1 + r.change24h / 100)
        : s,
    0,
  );
  const dayPct = total - dayChange > 0 ? (dayChange / (total - dayChange)) * 100 : 0;
  const unpriced = rows.filter((r) => !r.priced && !r.failed).length;
  const failedRows = rows.filter((r) => r.failed);
  const staleRows = rows.filter((r) => r.stale);
  const staleValue = staleRows.reduce((s, r) => s + (r.value ?? 0), 0);


  const onExportCsv = () => {
    if (!address || rows.length === 0) return;
    const meta = {
      address,
      chainName: data?.chainName,
      priceUpdatedAt,
      balancesUpdatedAt: dataUpdatedAt,
    };
    const csv = holdingsToCsv(
      rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        kind: r.kind,
        address: r.address,
        amount: r.amount,
        price: r.price,
        value: r.value,
        change24h: r.change24h,
        usdPeg: r.usdPeg,
        livePriced: r.livePriced,
        failed: r.failed,
        stale: r.stale,
        counted: r.counted,
      })),
      meta,
    );
    downloadCsv(holdingsCsvFilename(meta), csv);
    toast.success(`Exported ${rows.length} holdings to CSV`);
  };

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <DataSourcesDialog />
          <Select
            value={syncValue}
            onValueChange={(v) => setSyncValue(v as SyncIntervalValue)}
          >
            <SelectTrigger className="h-7 w-[168px] text-xs" title="Auto-refresh interval">
              <Clock className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Auto-refresh" />
            </SelectTrigger>
            <SelectContent>
              {SYNC_INTERVAL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-col items-end">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-emerald-500/30 text-xs"
              onClick={() => void onRefreshAll()}
              disabled={syncing}
              title="Re-detect ERC-20 tokens and re-price every holding"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {syncing ? "Refreshing…" : "Refresh"}
            </Button>
            <span className="mt-0.5 text-[10px] text-muted-foreground">
              {syncing
                ? "syncing tokens + prices…"
                : lastSyncAt
                  ? `last sync ${freshness(lastSyncAt)} · ${new Date(lastSyncAt).toLocaleTimeString()}`
                  : "not synced yet"}
              {syncMs > 0 ? " · auto" : " · manual"}
            </span>
          </div>
          {address && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => void refetch()}
              disabled={isFetching}
              title="Re-read balances only (uses the cached token scan)"
            >
              {isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Balances
            </Button>
          )}
        </div>


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
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button className="bg-emerald-500 text-black hover:bg-emerald-400">
                    Connect wallet (read-only)
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex flex-wrap items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-400" />
                      Read-only wallet connection
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-[10px] uppercase text-amber-300"
                      >
                        Trading disabled
                      </Badge>
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3 text-left">
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                          {[
                            "PumpPilot reads your public balances only. It never asks for a seed phrase or private key, and never requests a signature or token approval.",
                            "Momentum scores and price signals are probabilistic indicators, not guarantees or financial advice.",
                            "Trading execution is disabled app-wide — no order can be routed or submitted from your wallet.",
                            "Prices come from the CoinGecko public feed and refresh about every 60 seconds; unpriced tokens are excluded from totals.",
                          ].map((line) => (
                            <li key={line} className="flex gap-2">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-muted-foreground">
                          You can disconnect at any time from your wallet extension.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-emerald-500 text-black hover:bg-emerald-400"
                      onClick={() => void onConnect()}
                    >
                      I understand — connect read-only
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 gap-1 text-xs"
                disabled={rows.length === 0}
                onClick={onExportCsv}
                title="Download holdings as CSV (amount, value, price source, last updated)"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>


            {isError && (
              <p className="text-xs text-amber-300">
                Couldn't read balances — {(error as Error)?.message ?? "wallet unavailable"}.
              </p>
            )}

            {(failedRows.length > 0 || pricesError) && (
              <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span className="text-sm font-semibold text-rose-200">
                    Price fetch failed
                    {failedRows.length > 0
                      ? ` — ${failedRows.length} holding${failedRows.length > 1 ? "s" : ""} excluded from totals`
                      : ""}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-rose-200/90">
                  {failedRows.length > 0
                    ? `${failedRows.map((r) => r.symbol).join(", ")} could not be priced`
                    : "The live price feed is unavailable"}
                  {pricesError
                    ? ` — ${(priceError as Error)?.message ?? "the CoinGecko feed is unreachable"}`
                    : " — the feed returned no quote"}
                  . Affected holdings stay out of wallet value, 24h change, allocation and
                  history until the next successful refresh.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 gap-1 border-rose-500/50 text-xs text-rose-200"
                  onClick={() => void refetchPrices()}
                  disabled={pricesFetching}
                >
                  {pricesFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Retry price fetch
                </Button>
              </div>
            )}



            {staleRows.length > 0 && (
              <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="text-sm font-semibold text-amber-200">
                    Stale price data — {staleRows.length} holding
                    {staleRows.length > 1 ? "s" : ""} excluded from totals
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-amber-200/90">
                  The CoinGecko feed is {describeAge(priceUpdatedAt, now)}, past your{" "}
                  {Math.round(staleMs / 60_000)}-minute freshness limit.{" "}
                  {staleRows.map((r) => r.symbol).join(", ")} —{" "}
                  {fmtUsd(staleValue)} at last known prices — {staleRows.length > 1 ? "are" : "is"}{" "}
                  held out of wallet value, 24h change and allocation until the feed refreshes.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 gap-1 border-amber-500/50 text-xs text-amber-200"
                  onClick={() => void refetchPrices()}
                  disabled={pricesFetching}
                >
                  {pricesFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh prices
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Flag prices older than</span>
              <Select
                value={String(staleMs)}
                onValueChange={(v) => setStaleMs(Number(v))}
              >
                <SelectTrigger className="h-7 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STALE_OPTIONS.map((o) => (
                    <SelectItem key={o.ms} value={String(o.ms)} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>· stale holdings are excluded from totals until refreshed</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>Sparkline window</span>
              <div className="flex overflow-hidden rounded-md border border-border/60">
                {SPARK_WINDOW_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setSparkWindow(o.value)}
                    aria-pressed={sparkWindow === o.value}
                    title={`Show the last ${o.label} of hourly closes`}
                    className={`px-2.5 py-1 text-[11px] transition-colors ${
                      sparkWindow === o.value
                        ? "bg-primary/20 text-foreground"
                        : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <span>
                · hourly closes from the price feed
                {sparkWindow === "1h" ? " — 1h shows only the two most recent hourly points" : ""}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <Button
                  size="sm"
                  variant={compareMode ? "secondary" : "outline"}
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    setCompareMode((v) => !v);
                    if (compareMode) setComparePicks([]);
                  }}
                  aria-pressed={compareMode}
                  disabled={comparable.length < 2}
                >
                  {compareMode ? "Exit compare" : "Compare momentum"}
                </Button>
                {comparable.length < 2 ? (
                  <span>· need at least two holdings with price history</span>
                ) : compareMode ? (
                  <span>
                    · pick two holdings below ({comparePicks.length}/2 selected) — overlays
                    their {sparkWindow} sparklines normalized to % change
                  </span>
                ) : (
                  <span>· overlay two sparklines side-by-side</span>
                )}
                {compareMode && comparePicks.length > 0 && (
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => setComparePicks([])}
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {compareMode && comparePair.length === 2 && (
                <SparklineCompare
                  a={{ symbol: comparePair[0].symbol, points: comparePair[0].sparkline }}
                  b={{ symbol: comparePair[1].symbol, points: comparePair[1].sparkline }}
                  window={sparkWindow}
                  intervalMs={sparkConfig.intervalMs}
                  endTs={priceUpdatedAt || undefined}
                />
              )}
            </div>



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
              ready={rows.length > 0 && !isFetching && staleRows.length === 0}
            />

            <WalletAllocationChart
              items={rows
                .filter((r) => r.counted && r.value != null && r.value > 0)
                .map((r) => ({ symbol: r.symbol, value: r.value as number }))}
            />

            <LivePaperAllocationCompare
              liveItems={rows
                .filter((r) => r.counted && r.value != null && r.value > 0)
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

            {rows.length > 0 && (
              <div className="space-y-2 rounded-xl border border-border/60 bg-card/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[180px] flex-1">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search symbol, name or contract…"
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <Select
                    value={sort}
                    onValueChange={(v) => setSort(v as HoldingSort)}
                  >
                    <SelectTrigger className="h-8 w-[190px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SORT_LABELS) as HoldingSort[]).map((k) => (
                        <SelectItem key={k} value={k} className="text-xs">
                          {SORT_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(FILTER_LABELS) as HoldingFilter[]).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filter === f ? "secondary" : "ghost"}
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setFilter(f)}
                    >
                      {FILTER_LABELS[f]}
                    </Button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-border/60" />
                  <Button
                    size="sm"
                    variant={hideSpam ? "secondary" : "ghost"}
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={() => setHideSpam((v) => !v)}
                    title="Hide auto-detected, unpriced tokens whose name looks like a drainer lure"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Hide spam-likely{spamCount > 0 ? ` (${spamCount})` : ""}
                  </Button>
                  <Button
                    size="sm"
                    variant={pricedFirst ? "secondary" : "ghost"}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setPricedFirst((v) => !v)}
                    title="Sort holdings with a live price above unpriced ones"
                  >
                    Priced first
                  </Button>
                  <SpamListManager />
                </div>

                <div className="text-[10px] text-muted-foreground">
                  Showing {visibleRows.length} of {rows.length} holdings
                  {hideSpam && spamCount > 0 ? ` · ${spamCount} spam-likely hidden` : ""}
                  . Spam detection is a heuristic — never approve or interact with unknown
                  tokens.
                </div>
              </div>
            )}

            {rows.length > 0 && visibleRows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No holdings match these filters.
              </p>
            )}

            <div className="space-y-2">
              {visibleRows
                .map((r) => (

                  <div
                    key={`${r.symbol}-${r.kind}-${r.address ?? "native"}`}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 ${
                      r.failed
                        ? "border-rose-500/50 bg-rose-500/[0.07]"
                        : r.stale
                          ? "border-amber-500/50 bg-amber-500/[0.07]"
                          : "border-border/60 bg-muted/20"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.symbol}</span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] uppercase ${
                            r.failed
                              ? "border-rose-500/50 text-rose-300"
                              : r.stale
                                ? "border-amber-500/50 text-amber-300"
                                : r.livePriced
                                  ? "border-emerald-500/30 text-emerald-300"
                                  : r.usdPeg
                                    ? "border-border/60 text-muted-foreground"
                                    : "border-amber-500/40 text-amber-300"
                          }`}
                          title={
                            r.failed
                              ? ((priceError as Error)?.message ??
                                "Price fetch failed — excluded from totals")
                              : undefined
                          }
                        >
                          {r.failed
                            ? "price unavailable · excluded"
                            : r.stale
                              ? "stale price · excluded"
                              : r.livePriced
                                ? "live price"
                                : r.usdPeg
                                  ? "USD peg"

                                : "no live price"}
                        </Badge>
                        {(() => {
                          const v = evaluateSpam(r as SpamInput, spamLists);
                          if (!v.spam) return null;
                          return (
                            <Badge
                              variant="outline"
                              className="border-rose-500/40 text-[9px] uppercase text-rose-300"
                              title={
                                v.source === "blocklist"
                                  ? "You blocklisted this token"
                                  : v.signals.map((s) => `• ${s.label} (+${s.weight})`).join("\n")
                              }
                            >
                              spam-likely
                              {v.source === "blocklist" ? " · blocklisted" : ` · ${v.signals.length} signals`}
                            </Badge>
                          );
                        })()}
                        {r.discovered && (
                          <Badge
                            variant="outline"
                            className="border-sky-500/30 text-[9px] uppercase text-sky-300"
                            title={r.address}
                          >
                            auto-detected
                          </Badge>
                        )}
                        <HoldingInfoDrawer
                          holding={r}
                          chainId={data?.chainId}
                          chainName={data?.chainName}
                          priceUpdatedAt={priceUpdatedAt}
                        />
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
                        ) : r.failed ? (
                          <span className="text-rose-300">
                            Source: CoinGecko · last fetch failed
                            {pricesFetching ? " · retrying…" : " · retry to restore pricing"}
                          </span>
                        ) : (
                          <span>Source: none · no live feed for this asset</span>
                        )}
                      </div>

                      {compareMode && r.sparkline.length > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleCompare(r.symbol)}
                          aria-pressed={comparePicks.includes(r.symbol)}
                          className={`mt-1 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors ${
                            comparePicks.includes(r.symbol)
                              ? "border-primary/50 bg-primary/20 text-foreground"
                              : "border-border/60 text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          {comparePicks.includes(r.symbol)
                            ? "Selected for compare"
                            : "Compare"}
                        </button>
                      )}

                      {r.sparkline.length > 1 && (
                        <div className="mt-1">

                        <HoldingSparklineDrawer
                          symbol={r.symbol}
                          name={r.name}
                          points={r.sparkline}
                          up={(r.change24h ?? 0) >= 0}
                          endTs={priceUpdatedAt || undefined}
                          intervalMs={sparkConfig.intervalMs}
                          window={sparkWindow}
                          onWindowChange={setSparkWindow}
                          dimmed={r.stale || r.failed}
                          sourceNote={
                            r.usdPeg
                              ? "Stablecoin USD peg (fixed $1.00) — no live feed needed."
                              : r.failed
                                ? "CoinGecko — last fetch failed, prices may be out of date."
                                : "CoinGecko hourly closes. Read-only: no trades are executed."
                          }
                        >
                          <PriceSparkline
                            points={r.sparkline}
                            up={(r.change24h ?? 0) >= 0}
                            className={r.stale || r.failed ? "opacity-40" : ""}
                            symbol={r.symbol}
                            endTs={priceUpdatedAt || undefined}
                            intervalMs={sparkConfig.intervalMs}
                            title={`${r.symbol} — last ${sparkWindow} price movement (${r.sparkline.length} hourly points)`}
                          />

                          <span className="text-[10px] text-muted-foreground">
                            {sparkWindow}
                          </span>
                          <SparklineStats
                            points={r.sparkline}
                            className={r.stale || r.failed ? "opacity-60" : ""}
                          />
                          <span className="text-[10px] text-muted-foreground md:hidden">
                            Tap to expand
                          </span>
                        </HoldingSparklineDrawer>
                        </div>
                      )}

                    </div>

                    <div className="text-right">
                      <div
                        className={`font-mono text-sm font-semibold ${
                          r.stale || r.failed ? "text-muted-foreground line-through" : ""
                        }`}
                        title={
                          r.failed
                            ? "Price unavailable — excluded from totals"
                            : r.stale
                              ? "Last known value — excluded from totals"
                              : undefined
                        }
                      >
                        {r.value != null ? fmtUsd(r.value) : "—"}
                      </div>
                      {r.failed && (
                        <div className="text-[10px] uppercase text-rose-300">not counted</div>
                      )}
                      {r.stale && (
                        <div className="text-[10px] uppercase text-amber-300">not counted</div>

                      )}
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
