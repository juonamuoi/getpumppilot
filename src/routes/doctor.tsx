import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute } from "@tanstack/react-router";
import { CreditGate } from "@/components/credit-gate";
import { useCredits } from "@/hooks/useCredits";
import { CREDIT_COSTS } from "@/lib/credits";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePaper } from "@/lib/paper-store";
import { ASSETS, getAsset, fmtUsd } from "@/lib/mock-data";
import { analyzePortfolio, type DoctorReport } from "@/lib/portfolio-doctor.functions";
import { useOnboarding } from "@/lib/onboarding-store";
import {
  Stethoscope,
  Sparkles,
  Loader2,
  ArrowUp,
  ArrowDown,
  Scissors,
  Minus,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/doctor")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://www.getpumppilot.app/doctor" }],
    meta: withSocialMeta([
      { property: "og:url", content: "https://www.getpumppilot.app/doctor" },
      { title: "Portfolio Doctor — PumpPilot AI" },
      {
        name: "description",
        content:
          "AI-powered diagnosis of your paper portfolio: concentration, cash buffer, momentum quality and explainable rebalance ideas. Demo data only.",
      },
      { property: "og:title", content: "Portfolio Doctor — PumpPilot AI" },
      {
        property: "og:description",
        content: "Explainable AI diagnosis and rebalance ideas for your paper portfolio.",
      },
    ]),
  }),
  component: GatedDoctorPage,
});

const ACTION_META: Record<
  string,
  { label: string; icon: typeof ArrowUp; tone: string }
> = {
  buy: { label: "Buy", icon: ArrowUp, tone: "border-emerald-500/30 text-emerald-300" },
  sell: { label: "Sell", icon: ArrowDown, tone: "border-rose-500/30 text-rose-300" },
  trim: { label: "Trim", icon: Scissors, tone: "border-amber-500/30 text-amber-300" },
  hold: { label: "Hold", icon: Minus, tone: "border-slate-500/30 text-slate-300" },
  avoid: { label: "Avoid", icon: ShieldAlert, tone: "border-rose-500/30 text-rose-300" },
};

function DoctorPage() {
  const paper = usePaper();
  const { state: onb } = useOnboarding();
  const run = useServerFn(analyzePortfolio);
  const { spend } = useCredits();

  const [report, setReport] = useState<DoctorReport | null>(null);
  const [meta, setMeta] = useState<{ ok: boolean; error?: string } | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      // Credits are charged server-side inside analyzePortfolio.
      const positions = paper.positions.map((p) => {
        const a = getAsset(p.symbol)!;
        return {
          symbol: p.symbol,
          qty: p.qty,
          avgCost: p.avgCost,
          price: a.price,
          category: a.category,
          momentum: a.momentum.total,
          change24h: a.change24h,
        };
      });
      const heldSet = new Set(paper.positions.map((p) => p.symbol));
      const candidates = [...ASSETS]
        .filter((a) => !heldSet.has(a.symbol))
        .sort((a, b) => b.momentum.total - a.momentum.total)
        .slice(0, 6)
        .map((a) => ({
          symbol: a.symbol,
          qty: 0,
          avgCost: 0,
          price: a.price,
          category: a.category,
          momentum: a.momentum.total,
          change24h: a.change24h,
        }));

      return run({
        data: {
          cash: paper.cash,
          equity: paper.equity,
          risk: paper.risk,
          positions,
          candidates,
          riskProfile: onb.riskProfile ?? "balanced",
        },
      });
    },
    onSuccess: (res) => {
      setReport(res.report);
      setMeta({ ok: res.ok, error: res.ok ? undefined : res.error });
      if (!res.ok) toast.warning("AI unavailable — showing local heuristic diagnosis");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Diagnosis failed"),
  });

  const applyRec = (symbol: string, action: string, notional?: number) => {
    const a = getAsset(symbol);
    if (!a) return toast.error("Unknown symbol");
    if (action === "hold" || action === "avoid")
      return toast.message("Nothing to execute — this is a monitoring recommendation.");

    if (action === "buy") {
      const useNotional = notional && notional > 0 ? notional : paper.cash * 0.05;
      const qty = useNotional / a.price;
      const r = paper.trade(symbol, "buy", qty);
      r.ok ? toast.success(r.msg) : toast.error(r.msg);
      return;
    }

    // sell / trim
    const pos = paper.positions.find((p) => p.symbol === symbol);
    if (!pos) return toast.error("No open position for that symbol");
    const qty = action === "trim" ? pos.qty * 0.25 : pos.qty;
    const r = paper.trade(symbol, "sell", qty);
    r.ok ? toast.success(r.msg) : toast.error(r.msg);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
              <Stethoscope className="h-3.5 w-3.5" /> Portfolio Doctor
            </div>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">AI diagnosis of your book</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Ask the AI to review your current paper positions, cash buffer and risk limits, and
              propose explainable rebalance ideas. Every recommendation shows why, plus a risk and
              confidence level.
            </p>
          </div>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="bg-gradient-to-r from-emerald-400 to-cyan-500 text-black hover:opacity-90"
          >
            {mut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Diagnosing…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Run diagnosis
              </>
            )}
          </Button>
        </div>

        <DisclaimerBanner />

        {!report && !mut.isPending && (
          <Card className="border-dashed border-border/60 bg-card/40">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Tap <b>Run diagnosis</b> to have the AI analyse your current paper portfolio
              ({paper.positions.length} positions, {fmtUsd(paper.equity)} equity).
            </CardContent>
          </Card>
        )}

        {report && (
          <>
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <Card className="border-border/60 bg-card/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Health score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="font-mono text-5xl font-bold">
                      <span
                        className={
                          report.healthScore >= 70
                            ? "text-emerald-400"
                            : report.healthScore >= 40
                              ? "text-amber-300"
                              : "text-rose-400"
                        }
                      >
                        {report.healthScore}
                      </span>
                      <span className="text-lg text-muted-foreground">/100</span>
                    </div>
                    <Progress value={report.healthScore} className="mt-3 h-2" />
                    <p className="mt-3 text-xs text-muted-foreground">{report.headline}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Diagnosis</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {report.diagnosis.map((d, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                        <span className="text-foreground/90">{d}</span>
                      </li>
                    ))}
                  </ul>
                  {meta && !meta.ok && (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        AI unavailable — showing local heuristic fallback.
                        {meta.error ? ` (${meta.error})` : ""}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/60 bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.recommendations.length === 0 && (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    No specific actions recommended.
                  </div>
                )}
                {report.recommendations.map((r, i) => {
                  const meta = ACTION_META[r.action] ?? ACTION_META.hold;
                  const Icon = meta.icon;
                  return (
                    <div
                      key={i}
                      className="rounded-xl border border-border/60 bg-muted/20 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={meta.tone}>
                          <Icon className="mr-1 h-3 w-3" /> {meta.label}
                        </Badge>
                        <span className="font-semibold">{r.symbol}</span>
                        {r.suggestedNotionalUsd && (
                          <span className="font-mono text-xs text-muted-foreground">
                            ≈ {fmtUsd(r.suggestedNotionalUsd)}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-1 text-[10px]">
                          <Badge variant="outline" className="border-border/60">
                            confidence: {r.confidence}
                          </Badge>
                          <Badge variant="outline" className="border-border/60">
                            risk: {r.risk}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-foreground/90">{r.rationale}</p>
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            applyRec(r.symbol, r.action, r.suggestedNotionalUsd)
                          }
                        >
                          Apply as paper trade
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {report.disclaimer}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function GatedDoctorPage() {
  return (
    <CreditGate feature="doctor_audit" featureName="Portfolio Doctor">
      <DoctorPage />
    </CreditGate>
  );
}
