import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
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
import { Switch } from "@/components/ui/switch";
import { Bell, Trash2 } from "lucide-react";
import { ASSETS } from "@/lib/mock-data";
import { usePaper, type Alert } from "@/lib/paper-store";
import { toast } from "sonner";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — PumpPilot AI" },
      { name: "description", content: "Momentum and price alerts on your watchlist. Demo data." },
      { property: "og:title", content: "Alerts — PumpPilot AI" },
      { property: "og:description", content: "Momentum and price alerts." },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const { alerts, addAlert, removeAlert, toggleAlert } = usePaper();
  const [symbol, setSymbol] = useState("BTC");
  const [kind, setKind] = useState<Alert["kind"]>("price-above");
  const [value, setValue] = useState("");

  const submit = () => {
    const n = parseFloat(value);
    if (!n) return toast.error("Enter a valid value");
    addAlert({ symbol, kind, value: n });
    setValue("");
    toast.success("Alert created (demo)");
  };

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Simulated notifications when demo conditions are met.
          </p>
        </div>
        <DisclaimerBanner />

        <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">New alert</CardTitle>
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
                        {a.symbol} — {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Condition</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as Alert["kind"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price-above">Price above</SelectItem>
                    <SelectItem value="price-below">Price below</SelectItem>
                    <SelectItem value="momentum-above">Momentum score above</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                <Input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={kind === "momentum-above" ? "80" : "70000"}
                />
              </div>
              <Button onClick={submit} className="w-full">
                <Bell className="mr-2 h-4 w-4" /> Create alert
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Active alerts</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {alerts.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No alerts yet.</div>
              ) : (
                <div className="divide-y divide-border/60">
                  {alerts.map((a) => (
                    <div
                      key={a.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{a.symbol}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {labelForKind(a.kind)} {a.value}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={a.active} onCheckedChange={() => toggleAlert(a.id)} />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeAlert(a.id)}
                          aria-label="Delete alert"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function labelForKind(k: Alert["kind"]) {
  if (k === "price-above") return "Price above";
  if (k === "price-below") return "Price below";
  return "Momentum score above";
}
