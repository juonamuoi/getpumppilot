/* ------------------------------------------------------------------ *
 * Live trading status indicator.
 *
 * Makes the current execution mode unmistakable: whether live is ON, which
 * chain swaps route to, whether server-side DEX routing is configured, and
 * whether a wallet is connected to sign. Read-only — the kill switch and the
 * mode toggle stay in TradeModeSwitch.
 * ------------------------------------------------------------------ */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, Radio, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDexRoutingStatus } from "@/lib/dex.functions";
import { chainName, useLiveTrading } from "@/lib/live-trading";
import { useInjectedAccount } from "@/lib/wallet-balances";

function Check({ ok, label, pending }: { ok: boolean; label: string; pending?: boolean }) {
  const Icon = pending ? CircleDashed : ok ? CheckCircle2 : XCircle;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon
        className={`h-3.5 w-3.5 ${
          pending ? "animate-spin text-muted-foreground" : ok ? "text-emerald-400" : "text-destructive"
        }`}
      />
      {label}
    </span>
  );
}

export function LiveStatusIndicator() {
  const settings = useLiveTrading();
  const live = settings.mode === "live";
  const { address } = useInjectedAccount();
  const statusFn = useServerFn(getDexRoutingStatus);
  const { data, isPending } = useQuery({
    queryKey: ["dex-routing-status"],
    queryFn: () => statusFn({}),
    staleTime: 60_000,
  });

  const routingReady = data?.configured === true;

  return (
    <Card
      data-testid="live-status-indicator"
      className={
        live
          ? "border-emerald-500/40 bg-emerald-500/[0.07]"
          : "border-border/60 bg-card/60"
      }
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60">
            <Radio className={`h-4 w-4 ${live ? "text-emerald-400" : "text-muted-foreground"}`} />
            {live && (
              <span className="absolute inset-0 animate-ping rounded-full border border-emerald-400/50" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">
                {live ? "Live trading is ON" : "Live trading is OFF"}
              </p>
              <Badge
                variant="outline"
                className={
                  live
                    ? "border-emerald-500/40 text-emerald-300"
                    : "border-amber-500/40 text-amber-200"
                }
              >
                {live ? "LIVE" : "PAPER"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {live
                ? `Swaps route through ${data?.provider ?? "the DEX aggregator"} on ${chainName(settings.chainId)} and are signed in your own wallet.`
                : "Orders are simulated. No transaction is sent to any DEX."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Check ok={routingReady} pending={isPending} label={routingReady ? "DEX routing configured" : "DEX routing unavailable"} />
          <Check ok={Boolean(address)} label={address ? `Wallet ${address.slice(0, 6)}…${address.slice(-4)}` : "Wallet not connected"} />
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Max ${settings.maxTradeUsd.toLocaleString()} / trade · {(settings.slippageBps / 100).toFixed(2)}% slippage
          </span>
          {!live && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Unlock live below to route real swaps
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
