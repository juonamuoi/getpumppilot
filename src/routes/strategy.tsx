import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/strategy")({
  head: () => ({
    meta: [
      { title: "Strategy Builder — PumpPilot AI" },
      {
        name: "description",
        content:
          "Compose momentum, volume and volatility rules into a paper strategy. Demo data only.",
      },
      { property: "og:title", content: "Strategy Builder — PumpPilot AI" },
      {
        property: "og:description",
        content: "Compose momentum, volume and volatility rules into a paper strategy.",
      },
    ],
  }),
  component: StrategyPage,
});

function StrategyPage() {
  const [name, setName] = useState("Breakout Momentum v1");
  const [minScore, setMinScore] = useState([70]);
  const [minVolume, setMinVolume] = useState([50]);
  const [maxVol, setMaxVol] = useState([80]);
  const [includeDemo, setIncludeDemo] = useState(true);
  const [autoRebalance, setAutoRebalance] = useState(false);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Strategy Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compose rules that decide when the paper engine enters a position.
          </p>
        </div>
        <DisclaimerBanner />

        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1">
                <Label className="text-xs">Strategy name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <SliderRow
                label="Minimum momentum score"
                value={minScore}
                onValueChange={setMinScore}
                display={String(minScore[0])}
              />
              <SliderRow
                label="Minimum volume score"
                value={minVolume}
                onValueChange={setMinVolume}
                display={String(minVolume[0])}
              />
              <SliderRow
                label="Maximum volatility score"
                value={maxVol}
                onValueChange={setMaxVol}
                display={String(maxVol[0])}
              />

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
                <div>
                  <div className="text-sm font-medium">Include DEMO small-caps</div>
                  <div className="text-xs text-muted-foreground">
                    Higher risk fictional tokens
                  </div>
                </div>
                <Switch checked={includeDemo} onCheckedChange={setIncludeDemo} />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
                <div>
                  <div className="text-sm font-medium">Auto-rebalance (paper)</div>
                  <div className="text-xs text-muted-foreground">
                    Adjust positions daily to match target weights
                  </div>
                </div>
                <Switch checked={autoRebalance} onCheckedChange={setAutoRebalance} />
              </div>

              <Button
                onClick={() => toast.success(`Saved strategy "${name}" (paper mode)`)}
                className="w-full"
              >
                <Sparkles className="mr-2 h-4 w-4" /> Save strategy
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{name}</span> enters when:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Momentum score ≥ <span className="font-mono text-foreground">{minScore[0]}</span></li>
                <li>Volume score ≥ <span className="font-mono text-foreground">{minVolume[0]}</span></li>
                <li>Volatility score ≤ <span className="font-mono text-foreground">{maxVol[0]}</span></li>
                <li>{includeDemo ? "Includes" : "Excludes"} DEMO small-caps</li>
                <li>{autoRebalance ? "Auto-rebalances daily" : "Manual rebalance"}</li>
              </ul>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                Strategies execute only against the paper engine in this build. Live execution
                remains disabled.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function SliderRow({
  label,
  value,
  onValueChange,
  display,
}: {
  label: string;
  value: number[];
  onValueChange: (v: number[]) => void;
  display: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="font-mono text-xs text-emerald-300">{display}</span>
      </div>
      <Slider value={value} onValueChange={onValueChange} min={0} max={100} step={1} />
    </div>
  );
}
