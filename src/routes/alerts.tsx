import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Bell,
  Trash2,
  Search,
  PlayCircle,
  Mail,
  Smartphone,
  MonitorSmartphone,
  CheckCircle2,
  XCircle,
  BellOff,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { ASSETS } from "@/lib/mock-data";
import { usePaper, type Alert, type AlertDelivery, type ScannerRules } from "@/lib/paper-store";
import { toast } from "sonner";

type ChannelKey = AlertDelivery["channel"];
type StatusKey = AlertDelivery["status"];
const ALL_CHANNELS: ChannelKey[] = ["in-app", "email", "push"];
const ALL_STATUSES: StatusKey[] = ["delivered", "muted", "failed"];
const PAGE_SIZE_OPTIONS = [10, 25, 50];

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — PumpPilot AI" },
      {
        name: "description",
        content:
          "Configure momentum scanner thresholds, per-asset alerts and browse a searchable delivery history. Demo data.",
      },
      { property: "og:title", content: "Alerts — PumpPilot AI" },
      {
        property: "og:description",
        content: "Momentum scanner rules and delivery history.",
      },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure scanner thresholds, per-asset triggers, and review delivery history.
          </p>
        </div>
        <DisclaimerBanner />

        <Tabs defaultValue="rules">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="rules" className="flex-1 sm:flex-none">
              Scanner rules
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex-1 sm:flex-none">
              Custom alerts
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 sm:flex-none">
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-5">
            <ScannerRulesPanel />
          </TabsContent>
          <TabsContent value="custom" className="mt-5">
            <CustomAlertsPanel />
          </TabsContent>
          <TabsContent value="history" className="mt-5">
            <HistoryPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

/* -------------------------------- Scanner rules ------------------------------- */

function ScannerRulesPanel() {
  const paper = usePaper();
  const [r, setR] = useState<ScannerRules>(paper.scannerRules);

  const previewMatches = useMemo(() => {
    return ASSETS.filter((a) => {
      if (!r.includeMajors && a.category === "major") return false;
      if (!r.includeDemoSmallCaps && a.category === "demo-smallcap") return false;
      return (
        a.momentum.total >= r.minMomentum &&
        a.momentum.volume >= r.minVolumeScore &&
        a.momentum.volatility <= r.maxVolatility &&
        a.change24h >= r.min24hChangePct
      );
    });
  }, [r]);

  const save = () => {
    paper.setScannerRules(r);
    toast.success("Scanner rules saved");
  };

  const run = () => {
    paper.setScannerRules(r);
    const n = paper.simulateScannerRun();
    if (n === 0) toast.message("No assets matched — no alerts delivered");
    else toast.success(`${n} alert${n === 1 ? "" : "s"} delivered (see History)`);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SliderRow
            label="Minimum momentum score"
            value={r.minMomentum}
            onChange={(v) => setR({ ...r, minMomentum: v })}
            min={0}
            max={100}
          />
          <SliderRow
            label="Minimum volume score"
            value={r.minVolumeScore}
            onChange={(v) => setR({ ...r, minVolumeScore: v })}
            min={0}
            max={100}
          />
          <SliderRow
            label="Maximum volatility score"
            value={r.maxVolatility}
            onChange={(v) => setR({ ...r, maxVolatility: v })}
            min={0}
            max={100}
          />
          <SliderRow
            label="Minimum 24h change"
            value={r.min24hChangePct}
            onChange={(v) => setR({ ...r, min24hChangePct: v })}
            min={-20}
            max={50}
            suffix="%"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Majors (BTC, ETH, SOL, BNB)"
              checked={r.includeMajors}
              onChange={(v) => setR({ ...r, includeMajors: v })}
            />
            <ToggleRow
              label="Demo small-caps"
              checked={r.includeDemoSmallCaps}
              onChange={(v) => setR({ ...r, includeDemoSmallCaps: v })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Delivery channels</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              <ChannelToggle
                icon={<MonitorSmartphone className="h-4 w-4" />}
                label="In-app"
                checked={r.channels.inApp}
                onChange={(v) => setR({ ...r, channels: { ...r.channels, inApp: v } })}
              />
              <ChannelToggle
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                checked={r.channels.email}
                onChange={(v) => setR({ ...r, channels: { ...r.channels, email: v } })}
              />
              <ChannelToggle
                icon={<Smartphone className="h-4 w-4" />}
                label="Push"
                checked={r.channels.push}
                onChange={(v) => setR({ ...r, channels: { ...r.channels, push: v } })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Cooldown per asset</Label>
              <span className="font-mono text-xs text-emerald-300">
                {r.cooldownMinutes} min
              </span>
            </div>
            <Slider
              value={[r.cooldownMinutes]}
              onValueChange={(v) => setR({ ...r, cooldownMinutes: v[0] })}
              min={0}
              max={240}
              step={5}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={save} className="flex-1">
              Save rules
            </Button>
            <Button variant="outline" onClick={run} className="flex-1">
              <PlayCircle className="mr-2 h-4 w-4" /> Simulate scan
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Live preview</span>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
              {previewMatches.length} match{previewMatches.length === 1 ? "" : "es"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {previewMatches.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No assets match these thresholds right now.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {previewMatches.map((a) => (
                <div
                  key={a.symbol}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{a.symbol}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs text-emerald-300">
                      score {a.momentum.total}
                    </div>
                    <div
                      className={`font-mono text-[11px] ${
                        a.change24h >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {a.change24h >= 0 ? "+" : ""}
                      {a.change24h.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <span className="truncate text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ChannelToggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 transition ${
        checked
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border/60 bg-muted/30"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/* -------------------------------- Custom alerts ------------------------------- */

function CustomAlertsPanel() {
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
  );
}

function labelForKind(k: Alert["kind"]) {
  if (k === "price-above") return "Price above";
  if (k === "price-below") return "Price below";
  return "Momentum score above";
}

/* ---------------------------------- History --------------------------------- */

function HistoryPanel() {
  const { deliveries, clearDeliveries } = usePaper();
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState<"all" | AlertDelivery["channel"]>("all");
  const [status, setStatus] = useState<"all" | AlertDelivery["status"]>("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (channel !== "all" && d.channel !== channel) return false;
      if (status !== "all" && d.status !== status) return false;
      if (!term) return true;
      return (
        d.symbol.toLowerCase().includes(term) ||
        d.rule.toLowerCase().includes(term) ||
        d.detail.toLowerCase().includes(term)
      );
    });
  }, [deliveries, q, channel, status]);

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:items-center sm:justify-between">
          <CardTitle className="text-base">Delivery history</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearDeliveries();
              toast.success("History cleared");
            }}
            disabled={deliveries.length === 0}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search symbol, rule or detail…"
              className="pl-9"
            />
          </div>
          <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="in-app">In-app</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="push">Push</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="muted">Muted</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {deliveries.length === 0
              ? "No alerts delivered yet. Run a scanner simulation to populate history."
              : "No deliveries match these filters."}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((d) => (
              <DeliveryRow key={d.id} d={d} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeliveryRow({ d }: { d: AlertDelivery }) {
  const ChannelIcon =
    d.channel === "email"
      ? Mail
      : d.channel === "push"
        ? Smartphone
        : MonitorSmartphone;
  const StatusIcon =
    d.status === "delivered" ? CheckCircle2 : d.status === "muted" ? BellOff : XCircle;
  const statusColor =
    d.status === "delivered"
      ? "text-emerald-400"
      : d.status === "muted"
        ? "text-muted-foreground"
        : "text-rose-400";

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/40 text-muted-foreground">
        <ChannelIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold">{d.symbol}</span>
          <span className="truncate text-xs text-muted-foreground">{d.rule}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">{d.detail}</div>
      </div>
      <div className="text-right">
        <div className={`flex items-center justify-end gap-1 text-xs font-medium ${statusColor}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          <span className="capitalize">{d.status}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">{relativeTime(d.ts)}</div>
      </div>
    </div>
  );
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
