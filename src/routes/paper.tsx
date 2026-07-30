import { withSocialMeta } from "@/lib/social-meta";
import { FaqSection } from "@/components/faq-section";
import { paperFaqs } from "@/lib/page-faqs";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DemoBadge, DisclaimerBanner } from "@/components/disclaimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSETS, fmtPct, fmtUsd, getAsset } from "@/lib/mock-data";
import { useCredits } from "@/hooks/useCredits";
import { CREDIT_COSTS } from "@/lib/credits";
import { usePaper } from "@/lib/paper-store";
import { toast } from "sonner";
import { Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { RiskPresetSwitcher } from "@/components/risk-preset-switcher";

import { Switch } from "@/components/ui/switch";
import { HowToSteps } from "@/components/how-to-steps";
import { TourStartButton } from "@/components/guided-tour";
import { PAPER_TRADING_FLOW } from "@/lib/help-flows";
import { howToSchema, ldScript, faqSchema } from "@/lib/structured-data";

export const Route = createFileRoute("/paper")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://www.getpumppilot.app/paper" }],
    meta: withSocialMeta([
      { property: "og:url", content: "https://www.getpumppilot.app/paper" },
      { title: "Paper Trading — PumpPilot AI" },
      {
        name: "description",
        content:
          "Practice trading with simulated cash. Live execution is disabled and locked.",
      },
      { property: "og:title", content: "Paper Trading — PumpPilot AI" },
      {
        property: "og:description",
        content: "Practice trading with simulated cash — no real assets moved.",
      },
    ]),
    scripts: [
      ldScript(faqSchema(paperFaqs, "/paper")),
      ldScript(
        howToSchema({
          name: PAPER_TRADING_FLOW.name,
          description: PAPER_TRADING_FLOW.description,
          path: PAPER_TRADING_FLOW.path,
          totalTime: PAPER_TRADING_FLOW.totalTime,
          tools: PAPER_TRADING_FLOW.tools,
          steps: PAPER_TRADING_FLOW.steps,
        }),
      ),
    ],
  }),
  component: PaperPage,
});

function PaperPage() {
  const paper = usePaper();
  const { spend } = useCredits();
  const [symbol, setSymbol] = useState("BTC");
  const [qty, setQty] = useState("");
  const [sized, setSized] = useState<{
    notional: number;
    stop: number;
    target: number;
  } | null>(null);

  const asset = getAsset(symbol)!;

  const applyRiskControls = () => {
    const { maxPositionPct, stopLossPct, takeProfitPct } = paper.risk;
    const existing = paper.positions.find((p) => p.symbol === symbol);
    const existingValue = existing ? existing.qty * asset.price : 0;
    const allowed = (maxPositionPct / 100) * paper.equity - existingValue;
    const notional = Math.min(Math.max(allowed, 0), paper.cash);
    if (notional <= 0) {
      setSized(null);
      return toast.error(
        `No room under risk controls: ${symbol} already at or above ${maxPositionPct}% of equity (or no paper cash).`,
      );
    }
    const n = notional / asset.price;
    setQty(n.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""));
    setSized({
      notional,
      stop: asset.price * (1 - stopLossPct / 100),
      target: asset.price * (1 + takeProfitPct / 100),
    });
    toast.success(
      `Sized to ${fmtUsd(notional)} — within ${maxPositionPct}% max position. Stop ${stopLossPct}% / target ${takeProfitPct}% (simulated).`,
    );
  };


  const doTrade = async (side: "buy" | "sell") => {
    const n = parseFloat(qty);
    if (!n) return toast.error("Enter a quantity");
    const charge = await spend("bot_execution", { description: `${side.toUpperCase()} ${symbol}`, metadata: { symbol, side } });
    if (!charge.ok) {
      return toast.error(
        charge.reason === "insufficient_credits"
          ? `Out of credits — execution stopped. Each order costs ${CREDIT_COSTS.bot_execution} credit. Recharge to resume.`
          : "Could not charge credits. Try again.",
      );
    }
    const r = paper.trade(symbol, side, n);
    r.ok ? toast.success(r.msg) : toast.error(r.msg);
    if (r.ok) setQty("");
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold sm:text-3xl">Paper Trading</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Practice with simulated cash. No real orders are ever placed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TourStartButton />
            <div
              data-tour="paper-live-lock"
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5"
            >
              <Lock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-amber-200">Live execution</span>
              <Switch checked={false} disabled />
            </div>
          </div>
        </div>

        <DisclaimerBanner />

        <div data-tour="paper-balances" className="grid gap-3 sm:grid-cols-3">
          <StatBlock label="Equity" value={fmtUsd(paper.equity)} />
          <StatBlock label="Cash" value={fmtUsd(paper.cash)} />
          <StatBlock label="Positions" value={String(paper.positions.length)} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                Positions
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    paper.resetPaper();
                    toast.success("Paper account reset");
                  }}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {paper.positions.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No open positions.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {paper.positions.map((p) => {
                    const a = getAsset(p.symbol)!;
                    const value = a.price * p.qty;
                    const pnl = (a.price - p.avgCost) * p.qty;
                    const pnlPct = ((a.price - p.avgCost) / p.avgCost) * 100;
                    return (
                      <div
                        key={p.symbol}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold">{a.symbol}</span>
                            {a.isDemo && <DemoBadge />}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })} @{" "}
                            {fmtUsd(p.avgCost)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm">{fmtUsd(value)}</div>
                          <div
                            className={`font-mono text-xs ${
                              pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {fmtPct(pnlPct)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-tour="paper-order" className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Place paper order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Symbol</Label>
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSETS.map((a) => (
                      <SelectItem key={a.symbol} value={a.symbol}>
                        {a.symbol} — {fmtUsd(a.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0.0"
                />
                <div className="text-[11px] text-muted-foreground">
                  ≈ {qty ? fmtUsd((parseFloat(qty) || 0) * asset.price) : "$0.00"}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">Preset</span>
                  <RiskPresetSwitcher compact />
                </div>
                <div className="flex items-center justify-between gap-2">

                  <div className="text-[11px] text-muted-foreground">
                    Risk controls: max {paper.risk.maxPositionPct}% position · stop{" "}
                    {paper.risk.stopLossPct}% · target {paper.risk.takeProfitPct}%
                  </div>
                  <Button size="sm" variant="secondary" onClick={applyRiskControls}>
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    Apply risk controls
                  </Button>
                </div>
                {sized && (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground">Sized notional</div>
                      <div className="font-medium">{fmtUsd(sized.notional)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Stop price</div>
                      <div className="font-medium text-rose-400">{fmtUsd(sized.stop)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Target price</div>
                      <div className="font-medium text-emerald-400">{fmtUsd(sized.target)}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => doTrade("buy")}
                  className="bg-emerald-500 text-black hover:bg-emerald-400"
                >
                  Buy
                </Button>
                <Button variant="outline" onClick={() => doTrade("sell")}>
                  Sell
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-tour="paper-trades" className="border-border/60 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent paper trades</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {paper.trades.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No trades yet.</div>
            ) : (
              <div className="divide-y divide-border/60">
                {paper.trades.slice(0, 20).map((t) => (
                  <div
                    key={t.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-sm"
                  >
                    <div className="min-w-0 truncate">
                      <span
                        className={`mr-2 font-mono text-xs uppercase ${
                          t.side === "buy" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {t.side}
                      </span>
                      <span className="font-semibold">{t.symbol}</span>{" "}
                      <span className="text-muted-foreground">
                        {t.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })} @{" "}
                        {fmtUsd(t.price)}
                      </span>
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      {new Date(t.ts).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <HowToSteps flow={PAPER_TRADING_FLOW} />
        <FaqSection faqs={paperFaqs} title="Paper trading FAQ" />
      </div>
    </AppShell>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold">{value}</div>
    </div>
  );
}
