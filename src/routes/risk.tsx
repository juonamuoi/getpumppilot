import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { DeviceSecurityCard } from "@/components/device-security-card";
import { TourStartButton } from "@/components/guided-tour";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePaper } from "@/lib/paper-store";
import { toast } from "sonner";
import { Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/risk")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://www.getpumppilot.app/risk" }],
    meta: [
      { property: "og:url", content: "https://www.getpumppilot.app/risk" },
      { title: "Risk Controls — PumpPilot AI" },
      {
        name: "description",
        content:
          "Configure position limits, stop-loss, take-profit and daily loss caps. Live execution locked.",
      },
      { property: "og:title", content: "Risk Controls — PumpPilot AI" },
      {
        property: "og:description",
        content: "Configure paper trading risk controls.",
      },
    ],
  }),
  component: RiskPage,
});

function RiskPage() {
  const paper = usePaper();
  const [r, setR] = useState(paper.risk);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold sm:text-3xl">Risk Controls</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Guardrails applied to every paper order. Adjust to match your comfort.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TourStartButton />
            <div
              data-tour="risk-live-lock"
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5"
            >
              <Lock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-amber-200">Live execution locked</span>
            </div>
          </div>
        </div>

        <DisclaimerBanner />

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card data-tour="risk-limits" className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Limits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <SliderRow
                label="Max position size (% of equity)"
                value={r.maxPositionPct}
                onChange={(v) => setR({ ...r, maxPositionPct: v })}
                min={1}
                max={100}
                suffix="%"
              />
              <SliderRow
                label="Max daily loss (% of equity)"
                value={r.maxDailyLossPct}
                onChange={(v) => setR({ ...r, maxDailyLossPct: v })}
                min={1}
                max={50}
                suffix="%"
              />
              <SliderRow
                label="Default stop-loss"
                value={r.stopLossPct}
                onChange={(v) => setR({ ...r, stopLossPct: v })}
                min={1}
                max={50}
                suffix="%"
              />
              <SliderRow
                label="Default take-profit"
                value={r.takeProfitPct}
                onChange={(v) => setR({ ...r, takeProfitPct: v })}
                min={1}
                max={200}
                suffix="%"
              />
              <Button
                data-tour="risk-save"
                className="w-full"
                onClick={() => {
                  paper.setRisk(r);
                  toast.success("Risk controls updated");
                }}
              >
                Save risk controls
              </Button>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>Live execution</span>
                <Lock className="h-4 w-4 text-amber-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3">
                <div>
                  <div className="font-medium">Master switch</div>
                  <div className="text-xs text-muted-foreground">
                    Locked OFF in this build
                  </div>
                </div>
                <Switch checked={false} disabled />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3">
                <div>
                  <div className="font-medium">Exchange adapter</div>
                  <div className="text-xs text-muted-foreground">Disabled</div>
                </div>
                <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-rose-300">
                  Disabled
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-200/80">
                PumpPilot AI never asks for seed phrases or private keys. Live trading requires a
                separately audited release. Until then, all orders are simulated.
              </p>
            </CardContent>
          </Card>
        </div>

        <DeviceSecurityCard />
      </div>
    </AppShell>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="font-mono text-xs text-emerald-300">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={min}
        max={max}
        step={1}
      />
    </div>
  );
}
