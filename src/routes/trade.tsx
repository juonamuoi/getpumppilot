import { withSocialMeta } from "@/lib/social-meta";
import { robotsMetaFor } from "@/lib/indexing-policy";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { ErrorBoundary } from "@/components/error-boundary";
import { TradeModeSwitch } from "@/components/trade-mode-switch";
import { TradeSafetyGate } from "@/components/trade-safety-gate";
import { LiveSwapPanel } from "@/components/live-swap-panel";
import { LiveStatusIndicator } from "@/components/live-status-indicator";
import { RiskLimitsPanel } from "@/components/risk-limits-panel";
import { TradeRejectionHistory } from "@/components/trade-rejection-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, ShieldCheck, ListChecks } from "lucide-react";

const TITLE = "Trade — PumpPilot AI";
const DESC =
  "Preview and execute swaps: asset and network, amount, live quote, network fee, slippage, price impact and risk checks. You sign in your own wallet.";

export const Route = createFileRoute("/trade")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://www.getpumppilot.app/trade" }],
    meta: withSocialMeta([
      // Wallet-gated app surface: crawlable, but never indexed.
      ...robotsMetaFor("/trade"),
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: "Trade — PumpPilot AI" },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "https://www.getpumppilot.app/trade" },
    ]),
  }),
  component: TradeRoute,
});

const STEPS = [
  "Pick the asset, network and direction",
  "Enter an amount and refresh the quote",
  "Review fee, slippage, price impact and risk checks",
  "Confirm the preview, then sign in your own wallet",
];

function TradeRoute() {
  return (
    <ErrorBoundary
      boundary="trade_route"
      title="The trade workspace didn't load"
      description="Something went wrong while rendering the trade workspace. No orders were placed and nothing was signed."
    >
      <TradePage />
    </ErrorBoundary>
  );
}

function TradePage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold sm:text-3xl">Trade</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Quote, preview and execute a swap. Paper mode is the default; live broadcast stays
              gated until you connect a wallet and unlock it yourself.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 border-emerald-500/30 text-emerald-300">
            You sign every transaction
          </Badge>
        </header>

        <DisclaimerBanner />

        <Card className="border-border/60 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowLeftRight className="h-4 w-4 text-emerald-400" aria-hidden /> How an order flows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li
                  key={s}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground"
                >
                  <span className="mb-1 inline-grid h-6 w-6 place-items-center rounded-full bg-emerald-500/10 text-xs font-semibold text-emerald-300">
                    {i + 1}
                  </span>
                  <div>{s}</div>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              PumpPilot never asks for a seed phrase or private key, never holds custody, and never
              reports a broadcast it did not receive from your wallet.
            </p>
          </CardContent>
        </Card>

        <LiveStatusIndicator />
        <TradeSafetyGate />
        <TradeModeSwitch />

        <LiveSwapPanel />

        <section aria-labelledby="trade-risk" className="space-y-3">
          <h2
            id="trade-risk"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden /> Risk checks
          </h2>
          <RiskLimitsPanel />
          <p className="text-xs text-muted-foreground">
            Adjust thresholds in{" "}
            <Link to="/risk" className="underline hover:text-foreground">
              Risk Controls
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="trade-activity" className="space-y-3">
          <h2
            id="trade-activity"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <ListChecks className="h-4 w-4" aria-hidden /> Activity
          </h2>
          <TradeRejectionHistory />
          <p className="text-xs text-muted-foreground">
            Full order history and performance live in the{" "}
            <Link to="/journal" className="underline hover:text-foreground">
              Activity journal
            </Link>{" "}
            and{" "}
            <Link to="/paper" className="underline hover:text-foreground">
              paper trading desk
            </Link>
            .
          </p>
        </section>
      </div>
    </AppShell>
  );
}
