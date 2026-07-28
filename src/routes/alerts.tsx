import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { TuningDeltaChart } from "@/components/tuning-delta-chart";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Download,
  AlertTriangle,
  History,
  ArrowRight,
  Undo2,
  ShieldAlert,
  ShieldCheck,
  BellRing,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ASSETS } from "@/lib/mock-data";
import {
  usePaper,
  type Alert,
  type AlertDelivery,
  type ScannerRules,
  type TuningLogEntry,

} from "@/lib/paper-store";
import { TuningAuditExport } from "@/components/tuning-audit-export";

import { toast } from "sonner";
import {
  RuleImpactPreview,
  type RuleChangeSnapshot,
} from "@/components/rule-impact-preview";


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
  const { tuningLog } = usePaper();
  useNearMissRiskAlerts(tuningLog);
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
            <TabsTrigger value="replay" className="flex-1 sm:flex-none">
              Replay
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
          <TabsContent value="replay" className="mt-5">
            <ReplayPanel />
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

/** Threshold rules tracked in the tuning audit log. */
const AUDITED_RULES = [
  { key: "momentum", label: "Momentum", field: "minMomentum", op: ">=", unit: "" },
  { key: "volume", label: "Volume", field: "minVolumeScore", op: ">=", unit: "" },
  { key: "volatility", label: "Volatility", field: "maxVolatility", op: "<=", unit: "" },
  { key: "change", label: "24h change", field: "min24hChangePct", op: ">=", unit: "%" },
] as const;

/** Writes a single rule's threshold onto a ruleset, keeping its fixed operator. */
function withRuleValue(rules: ScannerRules, key: string, value: number): ScannerRules {
  const next: ScannerRules = { ...rules };
  if (key === "momentum") next.minMomentum = value;
  else if (key === "volume") next.minVolumeScore = value;
  else if (key === "volatility") next.maxVolatility = value;
  else if (key === "change") next.min24hChangePct = value;
  return next;
}

/**
 * The most recent still-active save. One "Save rules" or auto-apply run can touch
 * several rules at once, so entries logged within a short window count as one batch.
 */
/** Asset scope covered by a rule set, recorded on each tuning entry. */
function scopeOf(r: ScannerRules): "majors" | "demo" | "both" | "none" {
  if (r.includeMajors && r.includeDemoSmallCaps) return "both";
  if (r.includeMajors) return "majors";
  if (r.includeDemoSmallCaps) return "demo";
  return "none";
}

function lastTuningBatch(log: TuningLogEntry[]): TuningLogEntry[] {

  // Risk-bounds entries are audit-only — they don't map to a scanner threshold.
  // Preview entries were never applied, so they can't be rolled back either.
  const active = log.filter((e) => !e.revertedAt && e.kind !== "bounds" && e.phase !== "preview");


  if (active.length === 0) return [];
  const newest = active.reduce((a, b) => (a.ts >= b.ts ? a : b));
  return active
    .filter((e) => Math.abs(newest.ts - e.ts) <= 2000 && e.source === newest.source)
    .sort((a, b) => b.ts - a.ts);
}

/** Restores every threshold in the batch to its pre-change value (oldest change last wins). */
function rollbackBatch(rules: ScannerRules, batch: TuningLogEntry[]): ScannerRules {
  let next = rules;
  for (const e of batch) next = withRuleValue(next, e.rule, e.oldValue);
  return next;
}


/** Matches + near-miss risk metrics for a ruleset across current mock assets. */
function ruleMetrics(rules: ScannerRules) {
  let matches = 0;
  let nearMiss = 0;
  for (const a of ASSETS) {
    if (!rules.includeMajors && a.category === "major") continue;
    if (!rules.includeDemoSmallCaps && a.category === "demo-smallcap") continue;
    const fails = [
      a.momentum.total >= rules.minMomentum,
      a.momentum.volume >= rules.minVolumeScore,
      a.momentum.volatility <= rules.maxVolatility,
      a.change24h >= rules.min24hChangePct,
    ].filter((ok) => !ok).length;
    if (fails === 0) matches += 1;
    else if (fails === 1) nearMiss += 1;
  }
  return { matches, nearMiss };
}

function ScannerRulesPanel() {
  const paper = usePaper();
  const [r, setR] = useState<ScannerRules>(paper.scannerRules);
  const [impact, setImpact] = useState<RuleChangeSnapshot | null>(null);


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
    const before = paper.scannerRules;
    const mBefore = ruleMetrics(before);
    const mAfter = ruleMetrics(r);
    let logged = 0;
    for (const rule of AUDITED_RULES) {
      const oldValue = before[rule.field];
      const newValue = r[rule.field];
      if (oldValue === newValue) continue;
      logged += 1;
      paper.logTuning({
        source: "manual-save",
        rule: rule.key,
        ruleLabel: rule.label,
        operator: rule.op,
        unit: rule.unit,
        oldValue,
        newValue,
        preset: "manual",
        scope: scopeOf(r),

        matchesBefore: mBefore.matches,
        matchesAfter: mAfter.matches,
        nearMissBefore: mBefore.nearMiss,
        nearMissAfter: mAfter.nearMiss,
      });
    }
    paper.setScannerRules(r);
    setImpact({ before, after: r, ts: Date.now() });
    toast.success(
      logged > 0
        ? `Scanner rules saved — ${logged} change${logged === 1 ? "" : "s"} recorded in the audit log`
        : "Scanner rules saved — see impact preview below",
    );
  };

  const revertEntry = (e: TuningLogEntry) => {
    const rule = AUDITED_RULES.find((x) => x.key === e.rule);
    if (!rule) return;
    const next: ScannerRules = { ...paper.scannerRules, [rule.field]: e.oldValue };
    setR(next);
    paper.setScannerRules(next);
    paper.markTuningReverted(e.id);
    toast.success(`${e.ruleLabel} reverted to ${e.oldValue}${e.unit}`);
  };

  /** One-click rollback of the whole last save (all thresholds it touched). */
  const rollbackLast = (batch: TuningLogEntry[], reason?: string) => {
    if (batch.length === 0) return;
    const before = paper.scannerRules;
    const next = rollbackBatch(before, batch);
    setR(next);
    paper.setScannerRules(next);
    for (const e of batch) paper.markTuningReverted(e.id, reason);
    setImpact({ before, after: next, ts: Date.now() });
    const label = batch
      .map((e) => `${e.ruleLabel} ${e.operator === ">=" ? "≥" : "≤"} ${e.oldValue}${e.unit}`)
      .join(", ");
    setRollbackUndo({
      rules: before,
      label: batch
        .map((e) => `${e.ruleLabel} ${e.operator === ">=" ? "≥" : "≤"} ${e.newValue}${e.unit}`)
        .join(", "),
      ts: Date.now(),
    });
    toast.success(`Rolled back last change — restored ${label}`, {
      action: { label: "Undo", onClick: () => undoRollback(before) },
      duration: 10000,
    });
  };

  /** Undo the rollback itself — reapplies the values that were rolled back. */
  const undoRollback = (snapshot: ScannerRules) => {
    const before = paper.scannerRules;
    setR(snapshot);
    paper.setScannerRules(snapshot);
    setImpact({ before, after: snapshot, ts: Date.now() });
    setRollbackUndo(null);
    toast.success("Rollback undone — your tuned thresholds are back");
  };

  const lastBatch = useMemo(() => lastTuningBatch(paper.tuningLog), [paper.tuningLog]);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackUndo, setRollbackUndo] = useState<{
    rules: ScannerRules;
    label: string;
    ts: number;
  } | null>(null);

  useEffect(() => {
    if (!rollbackUndo) return;
    const t = setTimeout(() => setRollbackUndo(null), 30000);
    return () => clearTimeout(t);
  }, [rollbackUndo]);








  const run = () => {
    paper.setScannerRules(r);
    const n = paper.simulateScannerRun();
    if (n === 0) toast.message("No assets matched — no alerts delivered");
    else toast.success(`${n} alert${n === 1 ? "" : "s"} delivered (see History)`);
  };

  return (
    <div className="space-y-5">
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

          {rollbackUndo && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]">
              <Undo2 className="h-3.5 w-3.5 text-amber-400" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-amber-200">Rollback applied</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  Undo restores {rollbackUndo.label} ·{" "}
                  {new Date(rollbackUndo.ts).toLocaleTimeString()} · expires in 30s
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[10px]"
                onClick={() => undoRollback(rollbackUndo.rules)}
              >
                <Undo2 className="h-3 w-3" /> Undo rollback
              </Button>
            </div>
          )}


          {lastBatch.length > 0 && (
            <Button
              variant="ghost"
              className="w-full gap-2 text-xs text-muted-foreground"
              onClick={() => setRollbackOpen(true)}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Roll back last change (
              {lastBatch
                .map((e) => `${e.ruleLabel} → ${e.oldValue}${e.unit}`)
                .join(", ")}
              )
            </Button>
          )}
          <RollbackConfirmDialog
            batch={lastBatch}
            open={rollbackOpen}
            onOpenChange={setRollbackOpen}
            onConfirm={(reason) => {
              setRollbackOpen(false);
              rollbackLast(lastBatch, reason);
            }}
          />


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

    {impact && (
      <RuleImpactPreview change={impact} onDismiss={() => setImpact(null)} />
    )}

    <TuningHistoryPanel
      log={paper.tuningLog}
      onClear={paper.clearTuningLog}
      onRevert={revertEntry}
      onRollbackLast={rollbackLast}
    />


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
  const [channels, setChannels] = useState<ChannelKey[]>([...ALL_CHANNELS]);
  const [statuses, setStatuses] = useState<StatusKey[]>([...ALL_STATUSES]);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const from = range?.from ? new Date(range.from).setHours(0, 0, 0, 0) : undefined;
    const to = range?.to
      ? new Date(range.to).setHours(23, 59, 59, 999)
      : range?.from
        ? new Date(range.from).setHours(23, 59, 59, 999)
        : undefined;
    return deliveries.filter((d) => {
      if (!channels.includes(d.channel)) return false;
      if (!statuses.includes(d.status)) return false;
      if (from !== undefined && d.ts < from) return false;
      if (to !== undefined && d.ts > to) return false;
      if (!term) return true;
      return (
        d.symbol.toLowerCase().includes(term) ||
        d.rule.toLowerCase().includes(term) ||
        d.detail.toLowerCase().includes(term)
      );
    });
  }, [deliveries, q, channels, statuses, range]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pageStart = (page - 1) * pageSize;
  const pageItems = filtered.slice(pageStart, pageStart + pageSize);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [q, channels, statuses, range, pageSize]);

  const resetFilters = () => {
    setQ("");
    setChannels([...ALL_CHANNELS]);
    setStatuses([...ALL_STATUSES]);
    setRange(undefined);
  };

  const activeFilterCount =
    (q ? 1 : 0) +
    (channels.length !== ALL_CHANNELS.length ? 1 : 0) +
    (statuses.length !== ALL_STATUSES.length ? 1 : 0) +
    (range?.from ? 1 : 0);

  const rangeLabel = range?.from
    ? range.to
      ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d")}`
      : format(range.from, "MMM d, yyyy")
    : "Any date";

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Delivery history</CardTitle>
            {activeFilterCount > 0 && (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
                {filtered.length} of {deliveries.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X className="mr-1 h-3.5 w-3.5" /> Reset
              </Button>
            )}
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal sm:w-56",
                  !range?.from && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {rangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={1}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
              <div className="flex items-center justify-between border-t border-border/60 p-2">
                <Button variant="ghost" size="sm" onClick={() => setRange(undefined)}>
                  Clear
                </Button>
                <div className="flex gap-1">
                  {[7, 30, 90].map((n) => (
                    <Button
                      key={n}
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const to = new Date();
                        const from = new Date();
                        from.setDate(to.getDate() - (n - 1));
                        setRange({ from, to });
                      }}
                    >
                      {n}d
                    </Button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Channels</span>
            <ToggleGroup
              type="multiple"
              size="sm"
              value={channels}
              onValueChange={(v) => setChannels((v as ChannelKey[]) ?? [])}
              className="flex-wrap justify-start"
            >
              <ToggleGroupItem value="in-app" aria-label="In-app">
                <MonitorSmartphone className="mr-1 h-3.5 w-3.5" /> In-app
              </ToggleGroupItem>
              <ToggleGroupItem value="email" aria-label="Email">
                <Mail className="mr-1 h-3.5 w-3.5" /> Email
              </ToggleGroupItem>
              <ToggleGroupItem value="push" aria-label="Push">
                <Smartphone className="mr-1 h-3.5 w-3.5" /> Push
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Status</span>
            {ALL_STATUSES.map((s) => (
              <StatusChip
                key={s}
                status={s}
                active={statuses.includes(s)}
                onToggle={() =>
                  setStatuses((prev) =>
                    prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                  )
                }
              />
            ))}
          </div>
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
            {pageItems.map((d) => (
              <DeliveryRow key={d.id} d={d} />
            ))}
          </div>
        )}
        {filtered.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 px-4 py-3 sm:flex-row">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(parseInt(v, 10))}
              >
                <SelectTrigger className="h-7 w-[84px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 font-mono text-xs">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusChip({
  status,
  active,
  onToggle,
}: {
  status: StatusKey;
  active: boolean;
  onToggle: () => void;
}) {
  const Icon =
    status === "delivered" ? CheckCircle2 : status === "muted" ? BellOff : XCircle;
  const activeCls =
    status === "delivered"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : status === "muted"
        ? "border-border bg-muted/40 text-foreground"
        : "border-rose-500/40 bg-rose-500/10 text-rose-300";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs capitalize transition",
        active
          ? activeCls
          : "border-border/60 bg-transparent text-muted-foreground hover:bg-muted/30",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {status}
    </button>
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

/* ----------------------------------- Replay ---------------------------------- */

type WindowKey = "1h" | "6h" | "24h" | "7d" | "30d";
const WINDOW_MS: Record<WindowKey, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};
const WINDOW_LABEL: Record<WindowKey, string> = {
  "1h": "Last hour",
  "6h": "Last 6 hours",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

export type RuleKey = "momentum" | "volume" | "volatility" | "change";

type ReplaySignal = {
  ts: number;
  symbol: string;
  price: number;
  momentum: number;
  volumeScore: number;
  volatility: number;
  change: number;
  category: "major" | "demo-smallcap";
  /** Slack per rule at match time (positive = passed by this margin). */
  slack: Record<RuleKey, number>;
  /** Rule with the smallest slack — the binding constraint. */
  binding: RuleKey;
};

type RuleImpact = {
  key: RuleKey;
  /** How many matches were bound by this rule (tightest slack). */
  bindingMatches: number;
  /** Snapshots that failed at least this rule. */
  failedAny: number;
  /** Snapshots that failed ONLY this rule (loosening it would unlock them). */
  failedOnly: number;
  /** Average slack across matches (higher = rule is loose). */
  avgSlack: number;
};

type ReplayResult = {
  window: WindowKey;
  steps: number;
  ranAt: number;
  signals: ReplaySignal[];
  evaluatedSnapshots: number;
  perBucket: number[];
  impact: Record<RuleKey, RuleImpact>;
  perBucketSnapshots: BucketSnapshot[][];
};

export type SnapshotOutcome = "match" | "fail" | "cooldown";

export type BucketSnapshot = {
  ts: number;
  symbol: string;
  category: "major" | "demo-smallcap";
  price: number;
  momentum: number;
  volumeScore: number;
  volatility: number;
  change: number;
  slack: Record<RuleKey, number>;
  outcome: SnapshotOutcome;
  failedRules: RuleKey[];
  cooldownRemainingMs?: number;
};

function jitter(seed: number) {
  const s = Math.sin(seed * 9301 + 49297) * 233280;
  return s - Math.floor(s);
}

function runReplay(rules: ScannerRules, windowKey: WindowKey, steps: number): ReplayResult {
  const end = Date.now();
  const spanMs = WINDOW_MS[windowKey];
  const start = end - spanMs;
  const stepMs = spanMs / steps;

  const cooldownMs = rules.cooldownMinutes * 60_000;
  const lastAccepted: Record<string, number> = {};
  const perBucket = new Array(steps).fill(0);
  const perBucketSnapshots: BucketSnapshot[][] = Array.from({ length: steps }, () => []);
  const signals: ReplaySignal[] = [];
  const zero = (): Record<RuleKey, number> => ({ momentum: 0, volume: 0, volatility: 0, change: 0 });
  const failedAny = zero();
  const failedOnly = zero();
  const slackSum = zero();
  const bindingCount = zero();

  const eligible = ASSETS.filter((a) => {
    if (!rules.includeMajors && a.category === "major") return false;
    if (!rules.includeDemoSmallCaps && a.category === "demo-smallcap") return false;
    return true;
  });

  let evaluated = 0;
  for (let i = 0; i < steps; i++) {
    const ts = start + Math.round(i * stepMs);
    for (const a of eligible) {
      evaluated++;
      const sp = a.sparkline;
      const idx = Math.min(sp.length - 1, Math.floor((i / steps) * sp.length));
      const price = sp[idx];
      const lookback = Math.min(idx, Math.max(1, Math.round(sp.length * 0.5)));
      const past = sp[idx - lookback] || sp[0];
      const change = ((price - past) / past) * 100;

      // Per-snapshot variation of momentum components (deterministic).
      const wobble = (Math.sin((i + a.symbol.charCodeAt(0)) * 0.55) + 1) / 2; // 0-1
      const noise = (jitter(i * 31 + a.symbol.charCodeAt(0)) - 0.5) * 14;
      const momentum = clamp(
        Math.round(a.momentum.total * (0.75 + 0.35 * wobble) + noise),
        0,
        100,
      );
      const volumeScore = clamp(
        Math.round(a.momentum.volume * (0.7 + 0.4 * wobble) + noise * 0.6),
        0,
        100,
      );
      const volatility = clamp(
        Math.round(a.momentum.volatility * (0.85 + 0.25 * (1 - wobble)) - noise * 0.4),
        0,
        100,
      );

      // Per-rule slack: positive = passed by this margin, negative = failed by this margin.
      const slack: Record<RuleKey, number> = {
        momentum: momentum - rules.minMomentum,
        volume: volumeScore - rules.minVolumeScore,
        volatility: rules.maxVolatility - volatility,
        change: change - rules.min24hChangePct,
      };
      const failedRules = (Object.keys(slack) as RuleKey[]).filter((k) => slack[k] < 0);
      const baseSnap = {
        ts,
        symbol: a.symbol,
        category: a.category,
        price,
        momentum,
        volumeScore,
        volatility,
        change,
        slack,
      };
      if (failedRules.length > 0) {
        for (const k of failedRules) failedAny[k]++;
        if (failedRules.length === 1) failedOnly[failedRules[0]]++;
        perBucketSnapshots[i].push({ ...baseSnap, outcome: "fail", failedRules });
        continue;
      }

      const last = lastAccepted[a.symbol] ?? -Infinity;
      if (ts - last < cooldownMs) {
        perBucketSnapshots[i].push({
          ...baseSnap,
          outcome: "cooldown",
          failedRules: [],
          cooldownRemainingMs: cooldownMs - (ts - last),
        });
        continue;
      }
      lastAccepted[a.symbol] = ts;
      perBucket[i]++;

      // Binding rule = smallest slack (in a scale-normalised sense).
      const norm = (k: RuleKey) => {
        // Volatility & change use different scales; normalise by their thresholds' scale.
        if (k === "change") return slack.change / 5; // 5% units
        return slack[k] / 20; // 20-point units for 0-100 scores
      };
      const binding = (Object.keys(slack) as RuleKey[]).reduce((best, k) =>
        norm(k) < norm(best) ? k : best,
      );
      for (const k of Object.keys(slack) as RuleKey[]) slackSum[k] += slack[k];
      bindingCount[binding]++;
      perBucketSnapshots[i].push({ ...baseSnap, outcome: "match", failedRules: [] });
      signals.push({
        ts,
        symbol: a.symbol,
        price,
        momentum,
        volumeScore,
        volatility,
        change,
        category: a.category,
        slack,
        binding,
      });
    }
  }

  const matches = signals.length || 1;
  const impact: Record<RuleKey, RuleImpact> = {
    momentum: buildImpact("momentum"),
    volume: buildImpact("volume"),
    volatility: buildImpact("volatility"),
    change: buildImpact("change"),
  };
  function buildImpact(k: RuleKey): RuleImpact {
    return {
      key: k,
      bindingMatches: bindingCount[k],
      failedAny: failedAny[k],
      failedOnly: failedOnly[k],
      avgSlack: slackSum[k] / matches,
    };
  }

  return {
    window: windowKey,
    steps,
    ranAt: Date.now(),
    signals,
    evaluatedSnapshots: evaluated,
    perBucket,
    perBucketSnapshots,
    impact,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportReplaySignalsCsv(
  result: ReplayResult,
  signals: ReplaySignal[],
  rules: ScannerRules,
) {
  const ranIso = new Date(result.ranAt).toISOString();
  const th = {
    momentum: ruleThreshold(rules, "momentum"),
    volume: ruleThreshold(rules, "volume"),
    volatility: ruleThreshold(rules, "volatility"),
    change: ruleThreshold(rules, "change"),
  };
  const header = [
    "run_at",
    "window",
    "timestamp",
    "symbol",
    "category",
    "price",
    "momentum",
    "volume_score",
    "volatility",
    "change_pct",
    "binding_rule",
    "slack_momentum",
    "slack_volume",
    "slack_volatility",
    "slack_change",
    "threshold_momentum",
    "threshold_volume",
    "threshold_volatility",
    "threshold_change_pct",
  ];
  const rows: (string | number)[][] = [header];
  for (const s of signals) {
    rows.push([
      ranIso,
      result.window,
      new Date(s.ts).toISOString(),
      s.symbol,
      s.category,
      s.price.toFixed(6),
      s.momentum.toFixed(2),
      s.volumeScore.toFixed(2),
      s.volatility.toFixed(2),
      s.change.toFixed(2),
      RULE_META[s.binding].short,
      s.slack.momentum.toFixed(2),
      s.slack.volume.toFixed(2),
      s.slack.volatility.toFixed(2),
      s.slack.change.toFixed(2),
      th.momentum,
      th.volume,
      th.volatility,
      th.change,
    ]);
  }
  downloadCsv(
    `pumppilot-replay-signals-${ranIso.replace(/[:.]/g, "-")}.csv`,
    rows,
  );
}

function exportRuleImpactCsv(result: ReplayResult, rules: ScannerRules) {
  const ranIso = new Date(result.ranAt).toISOString();
  const totalMatches = result.signals.length;
  const header = [
    "run_at",
    "window",
    "rule",
    "operator",
    "threshold",
    "binding_matches",
    "binding_pct",
    "failed_any",
    "failed_only",
    "avg_slack",
    "total_matches",
    "evaluations",
  ];
  const rows: (string | number)[][] = [header];
  (Object.keys(RULE_META) as RuleKey[]).forEach((k) => {
    const meta = RULE_META[k];
    const imp = result.impact[k];
    const pct = totalMatches ? (imp.bindingMatches / totalMatches) * 100 : 0;
    rows.push([
      ranIso,
      result.window,
      meta.short,
      meta.op,
      ruleThreshold(rules, k),
      imp.bindingMatches,
      pct.toFixed(1),
      imp.failedAny,
      imp.failedOnly,
      Number.isFinite(imp.avgSlack) ? imp.avgSlack.toFixed(2) : "",
      totalMatches,
      result.evaluatedSnapshots,
    ]);
  });
  downloadCsv(
    `pumppilot-replay-impact-${ranIso.replace(/[:.]/g, "-")}.csv`,
    rows,
  );
}

type TuningPreview = {
  matchesBefore: number;
  matchesAfter: number;
  nearMissThisBefore: number;
  nearMissThisAfter: number;
  nearMissAnyBefore: number;
  nearMissAnyAfter: number;
};

type RuleTuning = {
  key: RuleKey;
  current: number;
  suggested: number | null;
  unlocked: number;
  candidatePool: number;
  fragile: number;
  avgOtherMinSlack: number;
  preview: TuningPreview | null;
};

function snapshotValue(s: BucketSnapshot, k: RuleKey): number {
  if (k === "momentum") return s.momentum;
  if (k === "volume") return s.volumeScore;
  if (k === "volatility") return s.volatility;
  return s.change;
}

function computeTuning(
  result: ReplayResult,
  rules: ScannerRules,
  fraction: number = 0.5,
): Record<RuleKey, RuleTuning> {
  const keys: RuleKey[] = ["momentum", "volume", "volatility", "change"];
  const out = {} as Record<RuleKey, RuleTuning>;
  const allSnaps = result.perBucketSnapshots.flat();
  const FRAGILE_MARGIN = 5;
  for (const k of keys) {
    const meta = RULE_META[k];
    const current = ruleThreshold(rules, k);
    const pool = allSnaps.filter(
      (s) =>
        s.outcome === "fail" &&
        s.failedRules.length === 1 &&
        s.failedRules[0] === k,
    );
    if (pool.length === 0) {
      out[k] = {
        key: k,
        current,
        suggested: null,
        unlocked: 0,
        candidatePool: 0,
        fragile: 0,
        avgOtherMinSlack: 0,
        preview: null,
      };
      continue;
    }
    const targetCount = Math.max(1, Math.ceil(pool.length * fraction));
    const sorted = [...pool].sort(
      (a, b) => Math.abs(a.slack[k]) - Math.abs(b.slack[k]),
    );
    const unlocked = sorted.slice(0, targetCount);
    const values = unlocked.map((s) => snapshotValue(s, k));
    let suggested =
      meta.op === ">=" ? Math.min(...values) : Math.max(...values);
    suggested = Math.round(suggested * 10) / 10;
    let fragile = 0;
    let sumOther = 0;
    for (const s of unlocked) {
      const others = keys.filter((x) => x !== k).map((x) => s.slack[x]);
      const m = Math.min(...others);
      sumOther += m;
      if (m < FRAGILE_MARGIN) fragile++;
    }
    out[k] = {
      key: k,
      current,
      suggested,
      unlocked: unlocked.length,
      candidatePool: pool.length,
      fragile,
      avgOtherMinSlack: sumOther / unlocked.length,
      preview: simulateApply(allSnaps, k, suggested),
    };
  }
  return out;
}

// Reclassify eligible (match/fail) snapshots as if rule `k`'s threshold were
// replaced with `suggested`. Cooldown snapshots are left out of both sides.
function simulateApply(
  allSnaps: BucketSnapshot[],
  k: RuleKey,
  suggested: number,
): TuningPreview {
  const keys: RuleKey[] = ["momentum", "volume", "volatility", "change"];
  const meta = RULE_META[k];
  const eligible = allSnaps.filter((s) => s.outcome !== "cooldown");
  let matchesBefore = 0,
    matchesAfter = 0;
  let nearMissThisBefore = 0,
    nearMissThisAfter = 0;
  let nearMissAnyBefore = 0,
    nearMissAnyAfter = 0;
  for (const s of eligible) {
    // Before
    const beforeFailed = s.failedRules;
    if (beforeFailed.length === 0) matchesBefore++;
    if (beforeFailed.length === 1) {
      nearMissAnyBefore++;
      if (beforeFailed[0] === k) nearMissThisBefore++;
    }
    // After: recompute slack for k only
    const val = snapshotValue(s, k);
    const newSlackK =
      meta.op === ">=" ? val - suggested : suggested - val;
    const afterFailed: RuleKey[] = [];
    for (const rk of keys) {
      const sl = rk === k ? newSlackK : s.slack[rk];
      if (sl < 0) afterFailed.push(rk);
    }
    if (afterFailed.length === 0) matchesAfter++;
    if (afterFailed.length === 1) {
      nearMissAnyAfter++;
      if (afterFailed[0] === k) nearMissThisAfter++;
    }
  }
  return {
    matchesBefore,
    matchesAfter,
    nearMissThisBefore,
    nearMissThisAfter,
    nearMissAnyBefore,
    nearMissAnyAfter,
  };
}

/* -------------------- Scope-wide (portfolio) impact preview ------------------- */

export type ScopeAssetImpact = {
  symbol: string;
  category: "major" | "demo-smallcap";
  snapshots: number;
  matchesBefore: number;
  matchesAfter: number;
  nearMissBefore: number;
  nearMissAfter: number;
  /** Snapshots that flip fail -> match with the new threshold. */
  newlyMatched: number;
  /** Snapshots that flip match -> fail (only possible when tightening). */
  lostMatches: number;
};

export type ScopeImpact = {
  totals: {
    snapshots: number;
    matchesBefore: number;
    matchesAfter: number;
    nearMissBefore: number;
    nearMissAfter: number;
    newlyMatched: number;
    lostMatches: number;
    assetsAffected: number;
  };
  assets: ScopeAssetImpact[];
};

/**
 * Portfolio-level version of `simulateApply`: reclassifies every eligible
 * snapshot in the replay window per asset so we can show scope-wide near-miss
 * counts and expected signal deltas for a chosen mitigation value.
 */
function simulateScopeImpact(
  allSnaps: BucketSnapshot[],
  k: RuleKey,
  value: number,
  scope?: string[],
): ScopeImpact {
  const keys: RuleKey[] = ["momentum", "volume", "volatility", "change"];
  const meta = RULE_META[k];
  const scopeSet = scope && scope.length > 0 ? new Set(scope) : null;
  const byAsset = new Map<string, ScopeAssetImpact>();

  for (const s of allSnaps) {
    if (s.outcome === "cooldown") continue;
    if (scopeSet && !scopeSet.has(s.symbol)) continue;
    let row = byAsset.get(s.symbol);
    if (!row) {
      row = {
        symbol: s.symbol,
        category: s.category,
        snapshots: 0,
        matchesBefore: 0,
        matchesAfter: 0,
        nearMissBefore: 0,
        nearMissAfter: 0,
        newlyMatched: 0,
        lostMatches: 0,
      };
      byAsset.set(s.symbol, row);
    }
    row.snapshots++;

    const beforeFailed = s.failedRules;
    const wasMatch = beforeFailed.length === 0;
    if (wasMatch) row.matchesBefore++;
    if (beforeFailed.length === 1) row.nearMissBefore++;

    const val = snapshotValue(s, k);
    const newSlackK = meta.op === ">=" ? val - value : value - val;
    const afterFailed: RuleKey[] = [];
    for (const rk of keys) {
      const sl = rk === k ? newSlackK : s.slack[rk];
      if (sl < 0) afterFailed.push(rk);
    }
    const isMatch = afterFailed.length === 0;
    if (isMatch) row.matchesAfter++;
    if (afterFailed.length === 1) row.nearMissAfter++;
    if (isMatch && !wasMatch) row.newlyMatched++;
    if (!isMatch && wasMatch) row.lostMatches++;
  }

  const assets = [...byAsset.values()].sort((a, b) => {
    const da = Math.abs(a.matchesAfter - a.matchesBefore);
    const db = Math.abs(b.matchesAfter - b.matchesBefore);
    if (db !== da) return db - da;
    return a.symbol.localeCompare(b.symbol);
  });

  const totals = assets.reduce(
    (acc, a) => {
      acc.snapshots += a.snapshots;
      acc.matchesBefore += a.matchesBefore;
      acc.matchesAfter += a.matchesAfter;
      acc.nearMissBefore += a.nearMissBefore;
      acc.nearMissAfter += a.nearMissAfter;
      acc.newlyMatched += a.newlyMatched;
      acc.lostMatches += a.lostMatches;
      if (a.matchesAfter !== a.matchesBefore || a.nearMissAfter !== a.nearMissBefore)
        acc.assetsAffected++;
      return acc;
    },
    {
      snapshots: 0,
      matchesBefore: 0,
      matchesAfter: 0,
      nearMissBefore: 0,
      nearMissAfter: 0,
      newlyMatched: 0,
      lostMatches: 0,
      assetsAffected: 0,
    },
  );

  return { totals, assets };
}

function DeltaNum({ value, goodDown }: { value: number; goodDown?: boolean }) {
  const good = goodDown ? value <= 0 : value >= 0;
  return (
    <span className={cn("text-[10px]", value === 0 ? "text-muted-foreground" : good ? "text-emerald-400" : "text-destructive")}>
      {value >= 0 ? "+" : ""}
      {value}
    </span>
  );
}

/**
 * Scope-wide impact of a selected mitigation value: portfolio-level near-miss
 * counts, expected signal deltas, and a per-asset breakdown across the replay
 * window. Demo data only.
 */
function ScopeImpactPanel({
  impact,
  scopeLabel,
}: {
  impact: ScopeImpact;
  scopeLabel: string;
}) {
  const t = impact.totals;
  const dMatch = t.matchesAfter - t.matchesBefore;
  const dNear = t.nearMissAfter - t.nearMissBefore;
  if (t.snapshots === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
        No in-scope snapshots in this replay window to preview.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium">Scope-wide impact</div>
        <Badge variant="outline" className="border-border/60 text-[10px]">
          {scopeLabel} · {impact.assets.length} assets
        </Badge>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border border-border/50 p-1.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Portfolio signals
          </div>
          <div className="text-xs font-semibold">
            {t.matchesBefore} → {t.matchesAfter} <DeltaNum value={dMatch} />
          </div>
        </div>
        <div className="rounded border border-border/50 p-1.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Near-miss (all rules)
          </div>
          <div className="text-xs font-semibold">
            {t.nearMissBefore} → {t.nearMissAfter} <DeltaNum value={dNear} goodDown />
          </div>
        </div>
        <div className="rounded border border-border/50 p-1.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Newly matched
          </div>
          <div className="text-xs font-semibold text-emerald-400">{t.newlyMatched}</div>
        </div>
        <div className="rounded border border-border/50 p-1.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Signals lost
          </div>
          <div
            className={cn(
              "text-xs font-semibold",
              t.lostMatches > 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {t.lostMatches}
          </div>
        </div>
      </div>

      <div className="mt-2 max-h-40 overflow-auto rounded border border-border/50">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-1.5 py-1 text-left font-medium">Asset</th>
              <th className="px-1.5 py-1 text-right font-medium">Signals</th>
              <th className="px-1.5 py-1 text-right font-medium">Δ</th>
              <th className="px-1.5 py-1 text-right font-medium">Near-miss</th>
              <th className="px-1.5 py-1 text-right font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {impact.assets.map((a) => (
              <tr key={a.symbol} className="border-t border-border/40">
                <td className="px-1.5 py-1">
                  <span className="font-medium">{a.symbol}</span>
                  {a.category === "demo-smallcap" && (
                    <span className="ml-1 text-[9px] text-muted-foreground">demo</span>
                  )}
                </td>
                <td className="px-1.5 py-1 text-right tabular-nums">
                  {a.matchesBefore} → {a.matchesAfter}
                </td>
                <td className="px-1.5 py-1 text-right">
                  <DeltaNum value={a.matchesAfter - a.matchesBefore} />
                </td>
                <td className="px-1.5 py-1 text-right tabular-nums">
                  {a.nearMissBefore} → {a.nearMissAfter}
                </td>
                <td className="px-1.5 py-1 text-right">
                  <DeltaNum value={a.nearMissAfter - a.nearMissBefore} goodDown />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-1.5 text-[9px] text-muted-foreground">
        Counts are snapshots across the replayed window on mock/demo data — indicative
        only, not a return forecast.
      </p>
    </div>
  );
}





function PreviewStat({
  label,
  before,
  after,
  goodUp,
  goodDown,
}: {
  label: string;
  before: number;
  after: number;
  goodUp?: boolean;
  goodDown?: boolean;
}) {
  const delta = after - before;
  const tone =
    delta === 0
      ? "text-muted-foreground"
      : (delta > 0 && goodUp) || (delta < 0 && goodDown)
        ? "text-emerald-300"
        : (delta > 0 && goodDown) || (delta < 0 && goodUp)
          ? "text-rose-300"
          : "text-amber-300";
  return (
    <div className="rounded bg-muted/20 p-1.5">
      <div className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex items-baseline gap-1 font-mono text-[11px]">
        <span className="text-muted-foreground">{before}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-semibold text-foreground">{after}</span>
        <span className={cn("ml-auto text-[10px]", tone)}>
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      </div>
    </div>
  );
}

function RollbackConfirmDialog({
  batch,
  open,
  onOpenChange,
  onConfirm,
}: {
  batch: TuningLogEntry[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const op = (o: string) => (o === ">=" ? "≥" : "≤");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Roll back last change?</AlertDialogTitle>
          <AlertDialogDescription>
            This restores the thresholds and operator settings saved before your most recent
            tuning change. {batch.length} rule{batch.length === 1 ? "" : "s"} will change back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          {batch.map((e) => {
            const delta = e.oldValue - e.newValue;
            const stricter = e.operator === ">=" ? delta > 0 : delta < 0;
            return (
              <div
                key={e.id}
                className="rounded border border-border/60 bg-muted/20 p-2 text-[11px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{e.ruleLabel}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                    {e.source ?? "manual-save"}
                  </Badge>
                </div>

                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <div className="rounded border border-destructive/30 bg-destructive/10 p-1.5">
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      Before (current)
                    </div>
                    <div className="font-mono text-[12px] text-destructive">
                      {op(e.operator)} {e.newValue}
                      {e.unit}
                    </div>
                  </div>
                  <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-1.5">
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      After (reverted)
                    </div>
                    <div className="font-mono text-[12px] font-semibold text-emerald-400">
                      {op(e.operator)} {e.oldValue}
                      {e.unit}
                    </div>
                  </div>
                </div>

                <div className="mt-1 grid grid-cols-2 gap-1.5 text-[9px]">
                  <div className="flex items-center gap-1 rounded bg-background/50 px-1.5 py-1">
                    <span className="text-muted-foreground">Operator</span>
                    <span className="ml-auto font-mono text-foreground">
                      {op(e.operator)} → {op(e.operator)}
                    </span>
                    <Badge variant="secondary" className="h-3.5 px-1 text-[8px]">
                      unchanged
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 rounded bg-background/50 px-1.5 py-1">
                    <span className="text-muted-foreground">Threshold</span>
                    <span
                      className={cn(
                        "ml-auto font-mono",
                        stricter ? "text-amber-400" : "text-emerald-400",
                      )}
                    >
                      {delta > 0 ? "+" : ""}
                      {Number(delta.toFixed(2))}
                      {e.unit}
                    </span>
                    <Badge variant="secondary" className="h-3.5 px-1 text-[8px]">
                      {delta === 0 ? "same" : stricter ? "stricter" : "looser"}
                    </Badge>
                  </div>
                </div>

                <div className="mt-1 text-[9px] text-muted-foreground">
                  Saved {new Date(e.ts).toLocaleString()}
                  {e.mitigation ? ` · ${e.mitigation}` : ""}
                </div>
              </div>
            );
          })}

        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Reason for rollback (optional)
          </Label>
          <Input
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
            placeholder="e.g. too many false signals on DEMO tokens"
            maxLength={200}
            className="h-8 text-[12px]"
          />
          <p className="text-[10px] text-muted-foreground">
            Stored with each reverted audit log entry and included in CSV/JSON exports.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(reason.trim())}>
            Roll back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


function TuningHistoryPanel({
  log,
  onClear,
  onRevert,
  onRollbackLast,
}: {
  log: TuningLogEntry[];
  onClear: () => void;
  onRevert: (e: TuningLogEntry) => void;
  onRollbackLast: (batch: TuningLogEntry[], reason?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [ruleFilter, setRuleFilter] = useState("all");
  const [opFilter, setOpFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("all");

  const ruleOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of log) m.set(e.rule, e.ruleLabel);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [log]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff =
      rangeFilter === "all"
        ? 0
        : Date.now() -
          { "24h": 864e5, "7d": 6048e5, "30d": 2592e6 }[rangeFilter as "24h" | "7d" | "30d"];
    return log.filter((e) => {
      if (e.ts < cutoff) return false;
      if (ruleFilter !== "all" && e.rule !== ruleFilter) return false;
      if (opFilter !== "all" && e.operator !== opFilter) return false;
      if (sourceFilter !== "all" && (e.source ?? "manual-save") !== sourceFilter) return false;
      if (scopeFilter !== "all" && (e.scope ?? "both") !== scopeFilter) return false;
      if (!q) return true;
      return [
        e.ruleLabel,
        e.rule,
        e.preset,
        e.window ?? "",
        e.source ?? "manual-save",
        e.scope ?? "",
        e.mitigation ?? "",
        e.trigger ?? "",
        e.revertReason ?? "",

        `${e.oldValue}${e.unit}`,
        `${e.newValue}${e.unit}`,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [log, query, ruleFilter, opFilter, sourceFilter, scopeFilter, rangeFilter]);

  const filtersActive =
    query.trim() !== "" ||
    ruleFilter !== "all" ||
    opFilter !== "all" ||
    sourceFilter !== "all" ||
    scopeFilter !== "all" ||
    rangeFilter !== "all";

  const shown = expanded ? filtered : filtered.slice(0, 5);
  const batch = useMemo(() => lastTuningBatch(log), [log]);


  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <History className="h-3.5 w-3.5 text-primary" />
          <span>Tuning history</span>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            {filtersActive ? `${filtered.length}/${log.length}` : log.length}
          </Badge>

        </div>
        <div className="flex items-center gap-1">
          {batch.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={() => setRollbackOpen(true)}
              title={batch
                .map(
                  (e) =>
                    `${e.ruleLabel} ${e.operator} ${e.newValue}${e.unit} → ${e.oldValue}${e.unit}`,
                )
                .join("; ")}
            >
              <Undo2 className="h-3 w-3" />
              Roll back last change
              {batch.length > 1 ? ` (${batch.length})` : ""}
            </Button>
          )}
          <RollbackConfirmDialog
            batch={batch}
            open={rollbackOpen}
            onOpenChange={setRollbackOpen}
            onConfirm={(reason) => {
              setRollbackOpen(false);
              onRollbackLast(batch, reason);
            }}
          />

          <TuningAuditExport log={filtered} />
          {log.length > 0 && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={onClear}>
              Clear
            </Button>
          )}

        </div>
      </div>

      {batch.length > 0 && (
        <div className="mb-2 rounded border border-border/50 bg-background/40 p-2 text-[10px] text-muted-foreground">
          One click restores the previous thresholds and operator settings from the last save:
          <div className="mt-1 space-y-0.5">
            {batch.map((e) => {
              const o = e.operator === ">=" ? "≥" : "≤";
              return (
                <div key={e.id} className="flex items-center gap-1.5 font-mono text-[10px]">
                  <span className="text-foreground">{e.ruleLabel}</span>
                  <span className="text-destructive line-through">
                    {o} {e.newValue}
                    {e.unit}
                  </span>
                  <span>→</span>
                  <span className="font-semibold text-emerald-400">
                    {o} {e.oldValue}
                    {e.unit}
                  </span>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {log.length > 0 && (
        <div className="mb-2 space-y-2 rounded border border-border/50 bg-background/40 p-2">
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Input
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder="Search rule, preset, window or values…"
              className="h-7 text-[11px]"
            />
            {filtersActive && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2 text-[10px]"
                onClick={() => {
                  setQuery("");
                  setRuleFilter("all");
                  setOpFilter("all");
                  setSourceFilter("all");
                  setScopeFilter("all");
                  setRangeFilter("all");
                }}
              >
                Reset
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Select value={ruleFilter} onValueChange={setRuleFilter}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="Rule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rules</SelectItem>
                {ruleOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={opFilter} onValueChange={setOpFilter}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="Operator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any operator</SelectItem>
                <SelectItem value=">=">≥ (minimum)</SelectItem>
                <SelectItem value="<=">≤ (maximum)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any source</SelectItem>
                <SelectItem value="manual-save">Manual save</SelectItem>
                <SelectItem value="recommendation">Recommendation</SelectItem>
                <SelectItem value="auto">Automated</SelectItem>
                <SelectItem value="mitigation">Mitigation</SelectItem>

              </SelectContent>
            </Select>
            <Select value={scopeFilter} onValueChange={setScopeFilter}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="Asset scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any scope</SelectItem>
                <SelectItem value="both">Majors + DEMO</SelectItem>
                <SelectItem value="majors">Majors only</SelectItem>
                <SelectItem value="demo">DEMO small-caps only</SelectItem>
                <SelectItem value="none">No assets included</SelectItem>
              </SelectContent>
            </Select>
            <Select value={rangeFilter} onValueChange={setRangeFilter}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {log.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No recommendations applied yet. Applied threshold changes are recorded here with their old
          and new values.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No tuning entries match these filters — try resetting the search or time range.
        </p>
      ) : (

        <div className="space-y-1.5">
          {shown.map((e) => {
            const looser =
              e.operator === ">=" ? e.newValue < e.oldValue : e.newValue > e.oldValue;
            return (
              <div
                key={e.id}
                className="rounded-md border border-border/50 bg-background/40 p-2 text-[11px]"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{e.ruleLabel}</span>
                  <span className="font-mono text-muted-foreground">
                    {e.operator === ">=" ? "≥" : "≤"} {e.oldValue}
                    {e.unit}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span
                    className={`font-mono font-medium ${looser ? "text-warning" : "text-success"}`}
                  >
                    {e.operator === ">=" ? "≥" : "≤"} {e.newValue}
                    {e.unit}
                  </span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] capitalize">
                    {e.preset}
                  </Badge>
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                    {e.source === "manual-save"
                      ? "Manual save"
                      : e.source === "auto"
                        ? "Automated"
                        : e.source === "mitigation"
                          ? "Mitigation"
                          : "Recommendation"}
                  </Badge>
                  {e.kind === "bounds" && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                      Risk bound
                    </Badge>
                  )}
                  {e.phase === "preview" && (
                    <Badge
                      variant="outline"
                      className="h-4 border-sky-500/40 px-1.5 text-[9px] text-sky-300"
                    >
                      Preview only
                    </Badge>
                  )}
                  {e.phase === "applied" && e.previewId && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                      Reviewed
                    </Badge>
                  )}


                  {e.window && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                      {e.window}
                    </Badge>
                  )}
                  {e.scope && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                      {e.scope === "both"
                        ? "Majors + DEMO"
                        : e.scope === "majors"
                          ? "Majors"
                          : e.scope === "demo"
                            ? "DEMO"
                            : "No assets"}
                    </Badge>
                  )}

                  {e.revertedAt && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] text-muted-foreground">
                      Reverted
                    </Badge>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {format(new Date(e.ts), "MMM d, yyyy HH:mm:ss")}
                  </span>
                </div>
                {(e.matchesBefore != null || e.nearMissBefore != null) && (
                  <TuningDeltaChart
                    matchesBefore={e.matchesBefore}
                    matchesAfter={e.matchesAfter}
                    nearMissBefore={e.nearMissBefore}
                    nearMissAfter={e.nearMissAfter}
                  />
                )}
                {(e.scopeMatchesBefore != null || e.scopeNearMissBefore != null) && (
                  <div className="mt-1 rounded-md border border-border/50 bg-background/40 p-1.5 text-[10px] text-muted-foreground">
                    Scope-wide: signals {e.scopeMatchesBefore ?? 0} → {e.scopeMatchesAfter ?? 0}
                    {" · "}near-miss {e.scopeNearMissBefore ?? 0} → {e.scopeNearMissAfter ?? 0}
                    {e.scopeAssetsAffected != null && ` · ${e.scopeAssetsAffected} assets affected`}
                  </div>
                )}
                {(e.previewedAt || e.appliedAt) && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {e.previewedAt &&
                      `Previewed ${format(new Date(e.previewedAt), "MMM d, HH:mm:ss")}`}
                    {e.previewedAt && e.appliedAt && " · "}
                    {e.appliedAt && `Applied ${format(new Date(e.appliedAt), "MMM d, HH:mm:ss")}`}
                  </div>
                )}
                {(e.mitigation || e.trigger) && (
                  <div className="mt-1 rounded-md border border-border/50 bg-muted/20 p-1.5 text-[10px] text-muted-foreground">
                    {e.mitigation && (
                      <div className="text-foreground">
                        One-tap mitigation: {e.mitigation}
                        {e.recommendedValue != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            (replaced recommended {e.operator === ">=" ? "≥" : "≤"}{" "}
                            {e.recommendedValue}
                            {e.unit})
                          </span>
                        )}
                      </div>
                    )}
                    {e.trigger && <div className="mt-0.5">Triggered by → {e.trigger}</div>}
                  </div>
                )}
                {!e.revertedAt && e.kind !== "bounds" && e.phase !== "preview" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-6 gap-1 px-2 text-[10px]"
                    onClick={() => onRevert(e)}
                  >
                    <Undo2 className="h-3 w-3" />
                    Revert to {e.operator === ">=" ? "≥" : "≤"} {e.oldValue}
                    {e.unit}
                  </Button>
                )}

                {e.revertedAt && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Rolled back {format(new Date(e.revertedAt), "MMM d, HH:mm")}
                    {e.revertReason && (
                      <span className="text-foreground"> — “{e.revertReason}”</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length > 5 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-full text-[10px]"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : `Show all ${filtered.length}`}
            </Button>
          )}

        </div>
      )}
    </div>
  );
}

type RiskBounds = {
  enabled: boolean;
  /** Max allowed increase in near-miss (any rule) snapshots. */
  maxNearMissIncrease: number;
  /** Max allowed share of unlocked snapshots that are fragile, in percent. */
  maxFragilePct: number;
  /** Raise an in-app alert when a save pushes near-miss risk up. */
  alertEnabled: boolean;
  /** Near-miss increase (snapshots) that triggers the in-app alert. */
  alertNearMissIncrease: number;
  /** Which asset scope the alert watches. */
  alertScope: "any" | "majors" | "demo" | "both";
};

const DEFAULT_BOUNDS: RiskBounds = {
  enabled: true,
  maxNearMissIncrease: 5,
  maxFragilePct: 50,
  alertEnabled: true,
  alertNearMissIncrease: 3,
  alertScope: "any",
};

const BOUNDS_KEY = "pumppilot_tuning_bounds";

function loadBounds(): RiskBounds {
  if (typeof window === "undefined") return DEFAULT_BOUNDS;
  try {
    const raw = window.localStorage.getItem(BOUNDS_KEY);
    return raw ? { ...DEFAULT_BOUNDS, ...(JSON.parse(raw) as Partial<RiskBounds>) } : DEFAULT_BOUNDS;
  } catch {
    return DEFAULT_BOUNDS;
  }
}

function saveBounds(b: RiskBounds) {
  try {
    window.localStorage.setItem(BOUNDS_KEY, JSON.stringify(b));
  } catch {}
}

const SCOPE_LABEL: Record<string, string> = {
  majors: "Majors",
  demo: "DEMO",
  both: "Majors + DEMO",
  none: "No assets",
};

/**
 * Watches the tuning audit log and raises an in-app alert whenever a saved
 * rule/operator change increases near-miss risk beyond the configured threshold
 * for the selected asset scope.
 */
function useNearMissRiskAlerts(log: TuningLogEntry[]) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      // Skip entries that already existed when the page mounted.
      seen.current = new Set(log.map((e) => e.id));
      return;
    }
    const bounds = loadBounds();
    for (const e of log) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if (!bounds.alertEnabled) continue;
      if (e.nearMissBefore == null || e.nearMissAfter == null) continue;
      const scope = e.scope ?? "both";
      if (bounds.alertScope !== "any" && scope !== bounds.alertScope) continue;
      const delta = e.nearMissAfter - e.nearMissBefore;
      if (delta <= bounds.alertNearMissIncrease) continue;
      toast.error(`Near-miss risk up +${delta} on ${e.ruleLabel}`, {
        description: `${e.ruleLabel} ${e.operator === ">=" ? "≥" : "≤"} ${e.oldValue}${e.unit} → ${e.newValue}${e.unit} pushed near-miss from ${e.nearMissBefore} to ${e.nearMissAfter} (limit +${bounds.alertNearMissIncrease}, scope ${SCOPE_LABEL[scope] ?? scope}). Review the audit log or roll back.`,
        duration: 10_000,
      });
    }
  }, [log]);
}



/** Returns the list of bound violations for a recommendation; empty when it may be applied. */
function checkBounds(t: RuleTuning, bounds: RiskBounds): string[] {
  if (!bounds.enabled || t.suggested == null) return [];
  const out: string[] = [];
  const fragilePct = t.unlocked ? (t.fragile / t.unlocked) * 100 : 0;
  if (fragilePct > bounds.maxFragilePct) {
    out.push(
      `Fragility ${fragilePct.toFixed(0)}% exceeds your ${bounds.maxFragilePct}% limit`,
    );
  }
  if (t.preview) {
    const inc = t.preview.nearMissAnyAfter - t.preview.nearMissAnyBefore;
    if (inc > bounds.maxNearMissIncrease) {
      out.push(
        `Near-miss grows by ${inc} (limit +${bounds.maxNearMissIncrease})`,
      );
    }
  }
  return out;
}

/**
 * Sweeps the loosening fraction for one rule and plots matches (recall) against
 * near-miss count (risk) so the recall/risk frontier is visible while tuning.
 */
function FrontierChart({
  result,
  rules,
  preset,
  bounds,
}: {
  result: ReplayResult;
  rules: ScannerRules;
  preset: "conservative" | "balanced" | "aggressive";
  bounds: RiskBounds;
}) {
  const keys: RuleKey[] = ["momentum", "volume", "volatility", "change"];
  const presetFraction = preset === "conservative" ? 0.25 : preset === "aggressive" ? 0.9 : 0.5;

  const sweep = useMemo(() => {
    const fractions = Array.from({ length: 20 }, (_, i) => (i + 1) / 20);
    const perRule = {} as Record<
      RuleKey,
      {
        pool: number;
        points: {
          fraction: number;
          matches: number;
          nearMiss: number;
          suggested: number;
          fragilePct: number;
          inBounds: boolean;
        }[];
        base: { matches: number; nearMiss: number } | null;
      }
    >;
    for (const k of keys) {
      const points: (typeof perRule)[RuleKey]["points"] = [];
      let pool = 0;
      let base: { matches: number; nearMiss: number } | null = null;
      for (const f of fractions) {
        const t = computeTuning(result, rules, f)[k];
        pool = t.candidatePool;
        if (t.suggested == null || !t.preview) continue;
        base ??= {
          matches: t.preview.matchesBefore,
          nearMiss: t.preview.nearMissAnyBefore,
        };
        const last = points[points.length - 1];
        if (last && last.suggested === t.suggested) continue;
        points.push({
          fraction: f,
          matches: t.preview.matchesAfter,
          nearMiss: t.preview.nearMissAnyAfter,
          suggested: t.suggested,
          fragilePct: t.unlocked ? (t.fragile / t.unlocked) * 100 : 0,
          inBounds: checkBounds(t, bounds).length === 0,
        });
      }
      perRule[k] = { pool, points, base };
    }
    return perRule;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, rules, bounds.enabled, bounds.maxFragilePct, bounds.maxNearMissIncrease]);

  const available = keys.filter((k) => sweep[k].points.length > 0);
  const [rule, setRule] = useState<RuleKey | null>(null);
  const active = rule && available.includes(rule) ? rule : (available[0] ?? null);

  if (!active) return null;

  const data = sweep[active];
  const meta = RULE_META[active];
  const pts = data.points;
  const allX = [...pts.map((p) => p.matches), data.base?.matches ?? 0];
  const allY = [...pts.map((p) => p.nearMiss), data.base?.nearMiss ?? 0];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const W = 260;
  const H = 110;
  const PAD = 14;
  const sx = (v: number) =>
    PAD + (maxX === minX ? (W - 2 * PAD) / 2 : ((v - minX) / (maxX - minX)) * (W - 2 * PAD));
  const sy = (v: number) =>
    H - PAD - (maxY === minY ? (H - 2 * PAD) / 2 : ((v - minY) / (maxY - minY)) * (H - 2 * PAD));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.matches)},${sy(p.nearMiss)}`).join(" ");
  const current =
    pts.reduce<(typeof pts)[number] | null>(
      (best, p) =>
        !best || Math.abs(p.fraction - presetFraction) < Math.abs(best.fraction - presetFraction)
          ? p
          : best,
      null,
    ) ?? null;

  return (
    <div className="mb-3 rounded-md border border-border/60 bg-background/40 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium">Recall vs near-miss risk frontier</div>
        <div className="flex flex-wrap gap-1">
          {available.map((k) => (
            <Button
              key={k}
              size="sm"
              variant={k === active ? "secondary" : "ghost"}
              className="h-6 px-2 text-[10px]"
              onClick={() => setRule(k)}
            >
              {RULE_META[k].short}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-start gap-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[110px] w-full max-w-[280px] shrink-0"
          role="img"
          aria-label={`Matches versus near-miss frontier for ${meta.short}`}
        >
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="stroke-border" strokeWidth={1} />
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} className="stroke-border" strokeWidth={1} />
          {path && <path d={path} fill="none" className="stroke-primary/50" strokeWidth={1.5} />}
          {data.base && (
            <circle
              cx={sx(data.base.matches)}
              cy={sy(data.base.nearMiss)}
              r={3.5}
              className="fill-muted-foreground"
            >
              <title>{`Current rules — ${data.base.matches} matches, ${data.base.nearMiss} near-miss`}</title>
            </circle>
          )}
          {pts.map((p) => (
            <circle
              key={p.fraction}
              cx={sx(p.matches)}
              cy={sy(p.nearMiss)}
              r={current && p.fraction === current.fraction ? 4.5 : 2.5}
              className={
                !p.inBounds
                  ? "fill-rose-400/80"
                  : current && p.fraction === current.fraction
                    ? "fill-emerald-300"
                    : "fill-emerald-400/60"
              }
            >
              <title>
                {`${meta.short} ${meta.op} ${p.suggested}${meta.unit} — ${p.matches} matches, ${p.nearMiss} near-miss, ${p.fragilePct.toFixed(0)}% fragile${p.inBounds ? "" : " (out of bounds)"}`}
              </title>
            </circle>
          ))}
          <text x={W - PAD} y={H - 3} textAnchor="end" className="fill-muted-foreground text-[7px]">
            matches →
          </text>
          <text x={3} y={PAD - 5} className="fill-muted-foreground text-[7px]">
            near-miss ↑
          </text>
        </svg>

        <div className="min-w-[140px] flex-1 space-y-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Current rules
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-300" /> Selected preset (
            {(presetFraction * 100).toFixed(0)}%)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400/80" /> Breaches your risk bounds
          </div>
          {current && (
            <div className="pt-0.5 font-mono text-[10px] text-foreground">
              {meta.short} {meta.op} {current.suggested}
              {meta.unit} → {current.matches} matches / {current.nearMiss} near-miss
            </div>
          )}
          <p className="pt-0.5 leading-relaxed">
            Up and to the right means more signals but noisier ones — pick the knee, not the
            extreme. Demo data; more matches never means more profit.
          </p>
        </div>
      </div>
    </div>
  );
}


function RuleTuningPanel({
  result,
  rules,
  mitigationUndo,
  onUndoMitigation,
  onApply,
  onApplyBulk,
  onLogBoundsChange,
}: {
  result: ReplayResult;
  rules: ScannerRules;
  mitigationUndo: { label: string; detail: string; ts: number } | null;
  onUndoMitigation: () => void;
  onApply: (
    k: RuleKey,
    value: number,
    meta: {
      preset: string;
      preview: TuningPreview | null;
      mitigation?: string;
      trigger?: string;
      recommendedValue?: number;
      fragilePct?: number;
    },
  ) => void;
  onApplyBulk: (
    entries: Array<{
      key: RuleKey;
      value: number;
      preset: string;
      preview: TuningPreview | null;
      mitigation: string;
      trigger: string;
      recommendedValue?: number;
      fragilePct?: number;
    }>,
  ) => void;
  onLogBoundsChange: (e: {
    label: string;
    unit: string;
    oldValue: number;
    newValue: number;
    preview: TuningPreview | null;
    mitigation: string;
    trigger: string;
    recommendedValue: number;
    fragilePct?: number;
    window: WindowKey;
  }) => void;
}) {

  const [preset, setPreset] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [pending, setPending] = useState<RuleKey | null>(null);
  const [selected, setSelected] = useState<RuleKey[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bounds, setBounds] = useState<RiskBounds>(loadBounds);

  useEffect(() => {
    try {
      window.localStorage.setItem(BOUNDS_KEY, JSON.stringify(bounds));
    } catch {}
  }, [bounds]);
  const fraction = preset === "conservative" ? 0.25 : preset === "aggressive" ? 0.9 : 0.5;
  const tuning = useMemo(
    () => computeTuning(result, rules, fraction),
    [result, rules, fraction],
  );
  const keys: RuleKey[] = ["momentum", "volume", "volatility", "change"];
  const safest = useMemo(() => {
    const out = {} as Record<RuleKey, SaferOption | null>;
    for (const k of ["momentum", "volume", "volatility", "change"] as RuleKey[]) {
      out[k] = tuning[k].suggested == null ? null : safestAlternativeFor(result, rules, k, bounds);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, rules, tuning, bounds.enabled, bounds.maxFragilePct, bounds.maxNearMissIncrease]);
  const selectable = keys.filter((k) => safest[k] != null);
  const chosen = selected.filter((k) => safest[k] != null);
  const anySuggestion = keys.some((k) => tuning[k].suggested != null);
  const presetHint =
    preset === "conservative"
      ? "Unlocks ~25% of near-miss snapshots — tighter, safer"
      : preset === "aggressive"
        ? "Unlocks ~90% of near-miss snapshots — loosest, highest risk"
        : "Unlocks ~50% of near-miss snapshots — balanced default";
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">Rule tuning recommendations</Label>
        <ToggleGroup
          type="single"
          size="sm"
          value={preset}
          onValueChange={(v) => v && setPreset(v as typeof preset)}
          className="gap-0.5"
        >
          <ToggleGroupItem value="conservative" className="h-6 px-2 text-[10px]">
            Conservative
          </ToggleGroupItem>
          <ToggleGroupItem value="balanced" className="h-6 px-2 text-[10px]">
            Balanced
          </ToggleGroupItem>
          <ToggleGroupItem value="aggressive" className="h-6 px-2 text-[10px]">
            Aggressive
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="mb-2 text-[10px] text-muted-foreground">{presetHint}</div>

      <div className="mb-3 rounded-md border border-border/60 bg-background/40 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            <ShieldAlert className="h-3.5 w-3.5 text-primary" />
            Near-miss risk bounds
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              {bounds.enabled ? "Enforced" : "Off"}
            </span>
            <Switch
              checked={bounds.enabled}
              onCheckedChange={(v) => setBounds((b) => ({ ...b, enabled: v }))}
            />
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Max near-miss increase (snapshots)
            </Label>
            <Input
              type="number"
              min={0}
              className="h-7 text-xs"
              value={bounds.maxNearMissIncrease}
              disabled={!bounds.enabled}
              onChange={(e) =>
                setBounds((b) => ({
                  ...b,
                  maxNearMissIncrease: Math.max(0, Number(e.target.value) || 0),
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Max fragility (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              className="h-7 text-xs"
              value={bounds.maxFragilePct}
              disabled={!bounds.enabled}
              onChange={(e) =>
                setBounds((b) => ({
                  ...b,
                  maxFragilePct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                }))
              }
            />
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Recommendations that breach these limits cannot be applied.
        </p>

        <div className="mt-3 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <BellRing className="h-3.5 w-3.5 text-primary" />
              Alert me when a save raises near-miss risk
            </div>
            <Switch
              checked={bounds.alertEnabled}
              onCheckedChange={(v) => setBounds((b) => ({ ...b, alertEnabled: v }))}
            />
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Alert threshold (near-miss increase)
              </Label>
              <Input
                type="number"
                min={0}
                className="h-7 text-xs"
                value={bounds.alertNearMissIncrease}
                disabled={!bounds.alertEnabled}
                onChange={(e) =>
                  setBounds((b) => ({
                    ...b,
                    alertNearMissIncrease: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Watched scope</Label>
              <Select
                value={bounds.alertScope}
                disabled={!bounds.alertEnabled}
                onValueChange={(v) =>
                  setBounds((b) => ({ ...b, alertScope: v as RiskBounds["alertScope"] }))
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any scope</SelectItem>
                  <SelectItem value="both">Majors + DEMO</SelectItem>
                  <SelectItem value="majors">Majors only</SelectItem>
                  <SelectItem value="demo">DEMO only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Fires an in-app alert right after any rule/operator save whose near-miss count grows by
            more than this in the watched scope.
          </p>
        </div>

      </div>

      {mitigationUndo && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-2">
          <div className="min-w-0 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-amber-200">
              <Undo2 className="h-3.5 w-3.5" />
              Mitigation applied: {mitigationUndo.label}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              Undo restores {mitigationUndo.detail} ({format(new Date(mitigationUndo.ts), "HH:mm:ss")})
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onUndoMitigation}>
            <Undo2 className="mr-1 h-3 w-3" />
            Undo mitigation
          </Button>
        </div>
      )}

      <FrontierChart result={result} rules={rules} preset={preset} bounds={bounds} />

      {!anySuggestion ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          No near-miss snapshots in this window — current rules are the binding
          constraint on no failed evaluation, so there is nothing to unlock.
        </div>
      ) : (
        <>
        {selectable.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 p-2">
            <div className="flex items-center gap-2 text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              <span className="font-medium">Bulk safer apply</span>
              <span className="text-muted-foreground">
                {chosen.length} of {selectable.length} rules selected
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() =>
                  setSelected(chosen.length === selectable.length ? [] : selectable)
                }
              >
                {chosen.length === selectable.length ? "Clear" : "Select all"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                disabled={chosen.length === 0}
                onClick={() => setBulkOpen(true)}
              >
                Apply safer alternatives ({chosen.length})
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {keys.map((k) => {
            const meta = RULE_META[k];
            const t = tuning[k];
            const disabled = t.suggested == null;
            const delta = t.suggested != null ? t.suggested - t.current : 0;
            const fragilePct = t.unlocked
              ? (t.fragile / t.unlocked) * 100
              : 0;
            const violations = checkBounds(t, bounds);
            const blocked = violations.length > 0;
            const riskTone =
              fragilePct >= 60
                ? "text-rose-300"
                : fragilePct >= 30
                  ? "text-amber-300"
                  : "text-emerald-300";
            return (
              <div
                key={k}
                className={cn(
                  "rounded-md border bg-card/50 p-3",
                  meta.accent,
                  disabled && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("flex items-center gap-2 text-xs font-medium", meta.textClass)}>
                    {safest[k] && (
                      <Checkbox
                        className="h-3.5 w-3.5"
                        checked={selected.includes(k)}
                        aria-label={`Select ${meta.short} for bulk safer apply`}
                        onCheckedChange={(v) =>
                          setSelected((prev) =>
                            v ? [...prev.filter((x) => x !== k), k] : prev.filter((x) => x !== k),
                          )
                        }
                      />
                    )}
                    {meta.short}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-border/60 text-[10px]"
                  >
                    {meta.op}
                  </Badge>
                </div>

                {disabled ? (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    No failed-only snapshots on this rule.
                  </div>
                ) : (
                  <>
                    <div className="mt-2 flex items-baseline gap-1 text-sm">
                      <span className="text-muted-foreground">
                        {t.current}
                        {meta.unit}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className={cn("font-semibold", meta.textClass)}>
                        {t.suggested}
                        {meta.unit}
                      </span>
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({delta >= 0 ? "+" : ""}
                        {delta.toFixed(1)})
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Unlocks </span>
                        <span className="font-medium text-foreground">
                          +{t.unlocked}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          / {t.candidatePool} near-miss
                        </span>
                      </div>
                      <div className={riskTone}>
                        {t.fragile}/{t.unlocked} fragile
                        <span className="text-muted-foreground">
                          {" "}
                          ({fragilePct.toFixed(0)}%)
                        </span>
                      </div>
                    </div>

                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Avg other-rule slack on unlocked:{" "}
                      {t.avgOtherMinSlack.toFixed(1)} — lower means the
                      unlocked snapshots also nearly failed another rule.
                    </div>

                    {t.preview && (
                      <div className="mt-2 rounded border border-border/60 bg-background/40 p-2">
                        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                          <span>Before → After preview</span>
                          <span>this rule only</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[11px]">
                          <PreviewStat
                            label="Matches"
                            before={t.preview.matchesBefore}
                            after={t.preview.matchesAfter}
                            goodUp
                          />
                          <PreviewStat
                            label="Near-miss (any)"
                            before={t.preview.nearMissAnyBefore}
                            after={t.preview.nearMissAnyAfter}
                          />
                          <PreviewStat
                            label={`Near-miss (${meta.short})`}
                            before={t.preview.nearMissThisBefore}
                            after={t.preview.nearMissThisAfter}
                            goodDown
                          />
                        </div>
                      </div>
                    )}



                    {blocked && (
                      <div className="mt-2 rounded border border-destructive/50 bg-destructive/10 p-2">
                        <div className="flex items-center gap-1 text-[10px] font-medium text-destructive">
                          <ShieldAlert className="h-3 w-3" />
                          Blocked by your risk bounds
                        </div>
                        <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                          {violations.map((v) => (
                            <li key={v}>• {v}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 w-full text-xs"
                      disabled={blocked}
                      title={blocked ? violations.join("; ") : undefined}
                      onClick={() => setPending(k)}
                    >
                      {blocked ? "Apply blocked" : `Apply ${meta.short} ${meta.op} ${t.suggested}${meta.unit}`}
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}

      <BulkSaferApplyDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        keys={chosen}
        safest={safest}
        tuning={tuning}
        preset={preset}
        onConfirm={() => {
          onApplyBulk(
            chosen.map((k) => {
              const opt = safest[k]!;
              const t = tuning[k];
              const fragile = t.unlocked ? (t.fragile / t.unlocked) * 100 : 0;
              return {
                key: k,
                value: opt.value,
                preset: `${preset} · safest in-bounds (bulk)`,
                preview: opt.preview,
                mitigation: "Bulk safer alternative",
                trigger: `Recommendation ${RULE_META[k].short} ${RULE_META[k].op} ${t.suggested}${RULE_META[k].unit} carried ${fragile.toFixed(0)}% fragility; applied safest in-bounds value at ${opt.fragilePct.toFixed(0)}%`,
                recommendedValue: t.suggested ?? undefined,
                fragilePct: opt.fragilePct,
              };
            }),
          );
          setSelected([]);
          setBulkOpen(false);
        }}
      />

      <TuningConfirmDialog
        open={pending !== null}
        ruleKey={pending}
        tuning={pending ? tuning[pending] : null}
        preset={preset}
        result={result}
        rules={rules}
        bounds={bounds}
        onSetBounds={setBounds}
        onApplyAlternative={(value, preview, label, meta) => {
          if (!pending) return;
          onApply(pending, value, {
            preset: `${preset} · ${label}`,
            preview,
            mitigation: meta.mitigation,
            trigger: meta.trigger,
            recommendedValue: meta.recommendedValue,
            fragilePct: meta.fragilePct,
          });
          setPending(null);
        }}
        onLogBounds={(e) =>
          onLogBoundsChange({
            label: e.label,
            unit: e.unit,
            oldValue: e.oldValue,
            newValue: e.newValue,
            preview: e.preview,
            mitigation: e.meta.mitigation,
            trigger: e.meta.trigger,
            recommendedValue: e.meta.recommendedValue,
            fragilePct: e.meta.fragilePct,
            window: result.window,
          })
        }

        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (
            pending &&
            tuning[pending].suggested != null &&
            checkBounds(tuning[pending], bounds).length === 0
          ) {
            onApply(pending, tuning[pending].suggested!, {
              preset,
              preview: tuning[pending].preview,
            });
          }
          setPending(null);
        }}
      />
    </div>
  );
}

/** Review-then-apply dialog for applying safest in-bounds alternatives to several rules at once. */
function BulkSaferApplyDialog({
  open,
  onOpenChange,
  keys,
  safest,
  tuning,
  preset,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  keys: RuleKey[];
  safest: Record<RuleKey, SaferOption | null>;
  tuning: Record<RuleKey, ReturnType<typeof computeTuning>[RuleKey]>;
  preset: string;
  onConfirm: () => void;
}) {
  const rows = keys
    .map((k) => ({ k, opt: safest[k], t: tuning[k] }))
    .filter((r) => r.opt) as Array<{ k: RuleKey; opt: SaferOption; t: (typeof tuning)[RuleKey] }>;
  const matchesBefore = rows.reduce((a, r) => a + (r.opt.preview?.matchesBefore ?? 0), 0);
  const matchesAfter = rows.reduce((a, r) => a + (r.opt.preview?.matchesAfter ?? 0), 0);
  const nmBefore = rows.reduce((a, r) => a + (r.opt.preview?.nearMissAnyBefore ?? 0), 0);
  const nmAfter = rows.reduce((a, r) => a + (r.opt.preview?.nearMissAnyAfter ?? 0), 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            Apply safer alternatives to {rows.length} rule{rows.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Each rule gets its safest in-bounds value (lowest fragility) instead of the{" "}
            {preset} recommendation. Every change is logged to the tuning audit trail. Demo data —
            more matches never means more profit.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {rows.map(({ k, opt, t }) => {
            const meta = RULE_META[k];
            const recFragile = t.unlocked ? (t.fragile / t.unlocked) * 100 : 0;
            return (
              <div key={k} className="rounded-md border border-border/60 bg-muted/10 p-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className={cn("font-medium", meta.textClass)}>{meta.short}</span>
                  <span className="font-mono text-muted-foreground">
                    {t.current}
                    {meta.unit} → {opt.value}
                    {meta.unit}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
                  <PreviewStat
                    label="Matches"
                    before={opt.preview?.matchesBefore ?? 0}
                    after={opt.preview?.matchesAfter ?? 0}
                    goodUp
                  />
                  <PreviewStat
                    label="Near-miss"
                    before={opt.preview?.nearMissAnyBefore ?? 0}
                    after={opt.preview?.nearMissAnyAfter ?? 0}
                  />
                  <div>
                    <div className="text-muted-foreground">Fragility</div>
                    <div className="text-emerald-300">
                      {recFragile.toFixed(0)}% → {opt.fragilePct.toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Replaces recommendation {meta.short} {meta.op} {t.suggested}
                  {meta.unit}.
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-md border border-border/60 bg-background/40 p-2 text-[11px]">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Combined preview
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PreviewStat label="Matches" before={matchesBefore} after={matchesAfter} goodUp />
            <PreviewStat label="Near-miss (any)" before={nmBefore} after={nmAfter} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={rows.length === 0} onClick={onConfirm}>
            Apply all {rows.length}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A safer variant of the current recommendation, produced by sweeping smaller loosening fractions. */
type SaferOption = {
  id: string;
  title: string;
  detail: string;
  value: number;
  fraction: number;
  preview: TuningPreview | null;
  fragilePct: number;
  inBounds: boolean;
};

/**
 * Safest in-bounds alternative for a single rule: sweeps loosening fractions and
 * keeps the option with the lowest fragility (ties broken by more matches).
 */
function safestAlternativeFor(
  result: ReplayResult,
  rules: ScannerRules,
  ruleKey: RuleKey,
  bounds: RiskBounds,
): SaferOption | null {
  const meta = RULE_META[ruleKey];
  const seen = new Set<number>();
  let best: SaferOption | null = null;
  for (let i = 1; i <= 19; i++) {
    const f = i / 20;
    const t = computeTuning(result, rules, f)[ruleKey];
    if (t.suggested == null || !t.preview) continue;
    if (seen.has(t.suggested)) continue;
    seen.add(t.suggested);
    if (checkBounds(t, bounds).length > 0) continue;
    const fragilePct = t.unlocked ? (t.fragile / t.unlocked) * 100 : 0;
    const opt: SaferOption = {
      id: `f${i}`,
      title: `${meta.short} ${meta.op} ${t.suggested}${meta.unit}`,
      detail: `${t.preview.matchesAfter} matches · ${t.preview.nearMissAnyAfter} near-miss · ${fragilePct.toFixed(0)}% fragile`,
      value: t.suggested,
      fraction: f,
      preview: t.preview,
      fragilePct,
      inBounds: true,
    };
    if (
      !best ||
      opt.fragilePct < best.fragilePct - 0.001 ||
      (Math.abs(opt.fragilePct - best.fragilePct) <= 0.001 &&
        (opt.preview?.matchesAfter ?? 0) > (best.preview?.matchesAfter ?? 0))
    ) {
      best = opt;
    }
  }
  return best;
}

function useSaferAlternatives(
  result: ReplayResult,
  rules: ScannerRules,
  ruleKey: RuleKey | null,
  currentValue: number | null,
  bounds: RiskBounds,
) {
  return useMemo(() => {
    if (!ruleKey || currentValue == null) return [] as SaferOption[];
    const meta = RULE_META[ruleKey];
    const seen = new Set<number>([currentValue]);
    const out: SaferOption[] = [];
    for (let i = 1; i <= 19; i++) {
      const f = i / 20;
      const t = computeTuning(result, rules, f)[ruleKey];
      if (t.suggested == null || !t.preview) continue;
      if (seen.has(t.suggested)) continue;
      seen.add(t.suggested);
      const fragilePct = t.unlocked ? (t.fragile / t.unlocked) * 100 : 0;
      out.push({
        id: `f${i}`,
        title: `${meta.short} ${meta.op} ${t.suggested}${meta.unit}`,
        detail: `${t.preview.matchesAfter} matches · ${t.preview.nearMissAnyAfter} near-miss · ${fragilePct.toFixed(0)}% fragile`,
        value: t.suggested,
        fraction: f,
        preview: t.preview,
        fragilePct,
        inBounds: checkBounds(t, bounds).length === 0,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, rules, ruleKey, currentValue, bounds.enabled, bounds.maxFragilePct, bounds.maxNearMissIncrease]);
}

/**
 * Before/after preview for a single mitigation option: how near-miss risk and
 * signal counts move versus today's rules, and versus the pending recommendation.
 */
function MitigationOptionPreview({
  targetValue,
  unit,
  op,
  preview,
  fragilePct,
  pending,
  note,
}: {
  targetValue?: number;
  unit?: string;
  op?: string;
  preview: TuningPreview | null;
  fragilePct?: number;
  pending: TuningPreview | null;
  note?: string;
}) {
  if (!preview) {
    return (
      <div className="mt-1.5 rounded-md border border-border/60 bg-background/40 p-2 text-[10px] text-muted-foreground">
        {note ?? "No signal change — this only adjusts your risk tolerance settings."}
      </div>
    );
  }
  const dMatch = preview.matchesAfter - preview.matchesBefore;
  const dNear = preview.nearMissAnyAfter - preview.nearMissAnyBefore;
  const vsMatch = pending ? preview.matchesAfter - pending.matchesAfter : null;
  const vsNear = pending ? preview.nearMissAnyAfter - pending.nearMissAnyAfter : null;
  return (
    <div className="mt-1.5 rounded-md border border-border/60 bg-background/40 p-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {targetValue != null ? `Preview at ${op ?? ""} ${targetValue}${unit ?? ""}` : "Preview"}
        </span>
        <span>
          Signals {preview.matchesBefore} → {preview.matchesAfter} ({dMatch >= 0 ? "+" : ""}
          {dMatch})
        </span>
        <span>
          Near-miss {preview.nearMissAnyBefore} → {preview.nearMissAnyAfter} (
          {dNear >= 0 ? "+" : ""}
          {dNear})
        </span>
        {fragilePct != null && <span>Fragility {fragilePct.toFixed(0)}%</span>}
      </div>
      <TuningDeltaChart
        matchesBefore={preview.matchesBefore}
        matchesAfter={preview.matchesAfter}
        nearMissBefore={preview.nearMissAnyBefore}
        nearMissAfter={preview.nearMissAnyAfter}
      />
      {vsMatch != null && vsNear != null && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          vs pending recommendation: signals {vsMatch >= 0 ? "+" : ""}
          {vsMatch}, near-miss risk{" "}
          <span className={vsNear <= 0 ? "text-emerald-400" : "text-destructive"}>
            {vsNear >= 0 ? "+" : ""}
            {vsNear}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * In-dialog mitigation checklist: surfaces every risk the change introduces and,
 * for each, a one-tap safer action (tighten the threshold, widen the buffer, or
 * adjust the fragility tolerance).
 */
/** Extra audit context attached to every one-tap mitigation. */
type MitigationMeta = {
  mitigation: string;
  trigger: string;
  recommendedValue: number;
  fragilePct?: number;
  /** Audit id of the preview entry the user reviewed before applying. */
  previewId?: string;
};

/** Before/after metrics recorded when a mitigation preview is opened. */
export type MitigationPreviewLog = {
  ruleKey: RuleKey;
  label: string;
  mitigation: string;
  trigger: string;
  recommendedValue: number;
  fragilePct?: number;
  targetValue?: number;
  preview: TuningPreview | null;
  scope?: {
    matchesBefore: number;
    matchesAfter: number;
    nearMissBefore: number;
    nearMissAfter: number;
    assetsAffected: number;
  };
};

function MitigationChecklist({
  ruleKey,
  tuning,
  result,
  rules,
  bounds,
  onSetBounds,
  onApplyAlternative: applyAlternativeProp,
  onLogBounds: logBoundsProp,
  onLogPreview,
}: {
  ruleKey: RuleKey;
  tuning: RuleTuning;
  result: ReplayResult;
  rules: ScannerRules;
  bounds: RiskBounds;
  onSetBounds: (fn: (b: RiskBounds) => RiskBounds) => void;
  onApplyAlternative: (
    value: number,
    preview: TuningPreview | null,
    label: string,
    meta: MitigationMeta,
  ) => void;
  onLogBounds: (e: {
    label: string;
    unit: string;
    oldValue: number;
    newValue: number;
    meta: MitigationMeta;
    preview: TuningPreview | null;
  }) => void;
  /** Records the reviewed preview into the audit history; returns its entry id. */
  onLogPreview?: (e: MitigationPreviewLog) => string;
}) {
  /** Mitigation awaiting explicit confirmation (before/after summary shown first). */
  const [pendingItem, setPendingItem] = useState<Item | null>(null);
  /** Audit id of the preview logged when the confirm dialog was opened. */
  const previewIdRef = useRef<string | null>(null);
  const meta = RULE_META[ruleKey];

  const onApplyAlternative: typeof applyAlternativeProp = (value, preview, label, m) =>
    applyAlternativeProp(value, preview, label, {
      ...m,
      previewId: previewIdRef.current ?? undefined,
    });
  const onLogBounds: typeof logBoundsProp = (e) =>
    logBoundsProp({
      ...e,
      meta: { ...e.meta, previewId: previewIdRef.current ?? undefined },
    });


  const suggested = tuning.suggested!;
  const alternatives = useSaferAlternatives(result, rules, ruleKey, suggested, bounds);
  const fragilePct = tuning.unlocked ? (tuning.fragile / tuning.unlocked) * 100 : 0;
  const nearMissDelta = tuning.preview
    ? tuning.preview.nearMissAnyAfter - tuning.preview.nearMissAnyBefore
    : 0;

  // "Tighter" = closer to the current threshold than the recommendation.
  const tighter = alternatives
    .filter((a) => Math.abs(a.value - tuning.current) < Math.abs(suggested - tuning.current))
    .sort((a, b) => Math.abs(b.value - tuning.current) - Math.abs(a.value - tuning.current));
  const safestInBounds = tighter.find((a) => a.inBounds) ?? null;
  const lowestFragility =
    [...tighter].sort((a, b) => a.fragilePct - b.fragilePct)[0] ?? null;
  const buffered =
    tighter.find(
      (a) =>
        Math.abs(a.value - tuning.current) <= Math.abs(suggested - tuning.current) * 0.6,
    ) ?? null;

  const boundsViolations = checkBounds(tuning, bounds);
  const suggestedTolerance = Math.min(100, Math.ceil((fragilePct + 5) / 5) * 5);

  type Item = {
    key: string;
    label: string;
    hint: string;
    done: boolean;
    action?: { label: string; run: () => void };
    /** Before/after preview of the option this item offers. */
    option?: {
      targetValue?: number;
      preview: TuningPreview | null;
      fragilePct?: number;
      note?: string;
    };
  };

  /** Risk deltas that triggered the pending recommendation — recorded on every mitigation. */
  const triggerText = `Recommendation ${meta.op} ${suggested}${meta.unit}: near-miss ${tuning.preview?.nearMissAnyBefore ?? 0} → ${tuning.preview?.nearMissAnyAfter ?? 0} (${nearMissDelta >= 0 ? "+" : ""}${nearMissDelta}), signals ${tuning.preview?.matchesBefore ?? 0} → ${tuning.preview?.matchesAfter ?? 0}, fragility ${fragilePct.toFixed(0)}% (${tuning.fragile}/${tuning.unlocked}), avg other-rule slack ${tuning.avgOtherMinSlack.toFixed(1)}`;

  const items: Item[] = [];


  items.push({
    key: "tighten",
    label: "Tighten the filter instead of fully loosening it",
    hint: safestInBounds
      ? `Safer alternative: ${safestInBounds.title} — ${safestInBounds.detail}`
      : "No tighter alternative unlocks anything in this window.",
    done: !safestInBounds,
    action: safestInBounds
      ? {
          label: `Apply ${safestInBounds.title}`,
          run: () =>
            onApplyAlternative(safestInBounds.value, safestInBounds.preview, "tightened", {
              mitigation: `Tighten filter — ${safestInBounds.title}`,
              trigger: triggerText,
              recommendedValue: suggested,
              fragilePct: safestInBounds.fragilePct,
            }),

        }
      : undefined,
    option: safestInBounds
      ? {
          targetValue: safestInBounds.value,
          preview: safestInBounds.preview,
          fragilePct: safestInBounds.fragilePct,
        }
      : undefined,
  });

  items.push({
    key: "buffer",
    label: "Widen the buffer to other rules",
    hint:
      tuning.avgOtherMinSlack >= 2
        ? `Unlocked matches already keep avg slack ${tuning.avgOtherMinSlack.toFixed(1)} on other rules.`
        : buffered
          ? `Step back to ${buffered.title} — ${buffered.detail}`
          : `Avg other-rule slack is only ${tuning.avgOtherMinSlack.toFixed(1)}; no wider-buffer variant available.`,
    done: tuning.avgOtherMinSlack >= 2,
    action:
      tuning.avgOtherMinSlack < 2 && buffered
        ? {
            label: `Apply ${buffered.title}`,
            run: () =>
              onApplyAlternative(buffered.value, buffered.preview, "buffered", {
                mitigation: `Widen buffer — ${buffered.title}`,
                trigger: triggerText,
                recommendedValue: suggested,
                fragilePct: buffered.fragilePct,
              }),

          }
        : undefined,
    option:
      tuning.avgOtherMinSlack < 2 && buffered
        ? {
            targetValue: buffered.value,
            preview: buffered.preview,
            fragilePct: buffered.fragilePct,
          }
        : undefined,
  });

  items.push({
    key: "fragility",
    label: "Keep fragility inside your tolerance",
    hint:
      fragilePct <= bounds.maxFragilePct || !bounds.enabled
        ? `${fragilePct.toFixed(0)}% fragile vs your ${bounds.maxFragilePct}% tolerance.`
        : lowestFragility
          ? `${fragilePct.toFixed(0)}% exceeds your ${bounds.maxFragilePct}% tolerance. Lowest-fragility alternative: ${lowestFragility.title} (${lowestFragility.fragilePct.toFixed(0)}%).`
          : `${fragilePct.toFixed(0)}% exceeds your ${bounds.maxFragilePct}% tolerance — raise it only if you accept noisier alerts.`,
    done: !bounds.enabled || fragilePct <= bounds.maxFragilePct,
    action:
      bounds.enabled && fragilePct > bounds.maxFragilePct
        ? lowestFragility && lowestFragility.fragilePct <= bounds.maxFragilePct
          ? {
              label: `Apply ${lowestFragility.title}`,
              run: () =>
                onApplyAlternative(
                  lowestFragility.value,
                  lowestFragility.preview,
                  "low-fragility",
                  {
                    mitigation: `Lowest fragility — ${lowestFragility.title}`,
                    trigger: triggerText,
                    recommendedValue: suggested,
                    fragilePct: lowestFragility.fragilePct,
                  },
                ),
            }
          : {
              label: `Raise tolerance to ${suggestedTolerance}%`,
              run: () => {
                onSetBounds((b) => ({ ...b, maxFragilePct: suggestedTolerance }));
                onLogBounds({
                  label: "Fragility tolerance",
                  unit: "%",
                  oldValue: bounds.maxFragilePct,
                  newValue: suggestedTolerance,
                  preview: tuning.preview,
                  meta: {
                    mitigation: `Raise fragility tolerance to ${suggestedTolerance}%`,
                    trigger: triggerText,
                    recommendedValue: suggested,
                    fragilePct,
                  },
                });
              },
            }

        : undefined,
    option:
      bounds.enabled && fragilePct > bounds.maxFragilePct
        ? lowestFragility && lowestFragility.fragilePct <= bounds.maxFragilePct
          ? {
              targetValue: lowestFragility.value,
              preview: lowestFragility.preview,
              fragilePct: lowestFragility.fragilePct,
            }
          : {
              preview: null,
              note: `No signal change — raising tolerance to ${suggestedTolerance}% keeps the pending change (fragility ${fragilePct.toFixed(0)}%, near-miss ${nearMissDelta >= 0 ? "+" : ""}${nearMissDelta}) but accepts more noise.`,
            }
        : undefined,
  });

  items.push({
    key: "nearmiss",
    label: "Hold near-miss growth within your limit",
    hint:
      !bounds.enabled || nearMissDelta <= bounds.maxNearMissIncrease
        ? `Near-miss changes by ${nearMissDelta >= 0 ? "+" : ""}${nearMissDelta} (limit +${bounds.maxNearMissIncrease}).`
        : `Near-miss grows by ${nearMissDelta}, above your +${bounds.maxNearMissIncrease} limit.`,
    done: !bounds.enabled || nearMissDelta <= bounds.maxNearMissIncrease,
    action:
      bounds.enabled && nearMissDelta > bounds.maxNearMissIncrease
        ? {
            label: `Allow +${nearMissDelta}`,
            run: () => {
              onSetBounds((b) => ({ ...b, maxNearMissIncrease: nearMissDelta }));
              onLogBounds({
                label: "Near-miss increase limit",
                unit: "",
                oldValue: bounds.maxNearMissIncrease,
                newValue: nearMissDelta,
                preview: tuning.preview,
                meta: {
                  mitigation: `Allow near-miss increase of +${nearMissDelta}`,
                  trigger: triggerText,
                  recommendedValue: suggested,
                  fragilePct,
                },
              });
            },
          }

        : undefined,
    option:
      bounds.enabled && nearMissDelta > bounds.maxNearMissIncrease
        ? {
            preview: null,
            note: `No signal change — this raises your limit to +${nearMissDelta} so the pending change (near-miss ${tuning.preview?.nearMissAnyBefore ?? 0} → ${tuning.preview?.nearMissAnyAfter ?? 0}) is allowed.`,
          }
        : undefined,
  });

  const open = items.filter((i) => !i.done).length;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <ShieldAlert className="h-3.5 w-3.5 text-primary" />
          Mitigation checklist
        </div>
        <Badge variant="outline" className="border-border/60 text-[10px]">
          {open === 0 ? "All clear" : `${open} to review`}
        </Badge>
      </div>

      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px]",
                item.done
                  ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300"
                  : "border-amber-400/60 bg-amber-400/10 text-amber-300",
              )}
              aria-hidden
            >
              {item.done ? "✓" : "!"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium leading-snug">{item.label}</div>
              <div className="text-[10px] leading-relaxed text-muted-foreground">
                {item.hint}
              </div>
              {item.option && (
                <MitigationOptionPreview
                  targetValue={item.option.targetValue}
                  unit={meta.unit}
                  op={meta.op === ">=" ? "≥" : "≤"}
                  preview={item.option.preview}
                  fragilePct={item.option.fragilePct}
                  pending={tuning.preview}
                  note={item.option.note}
                />
              )}
              {item.action && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 h-6 px-2 text-[10px]"
                  onClick={() => {
                    const target = item.option?.targetValue;
                    const scopeImpact =
                      target != null
                        ? simulateScopeImpact(result.perBucketSnapshots.flat(), ruleKey, target)
                        : null;
                    previewIdRef.current =
                      onLogPreview?.({
                        ruleKey,
                        label: item.label,
                        mitigation: item.action?.label ?? item.label,
                        trigger: triggerText,
                        recommendedValue: suggested,
                        fragilePct: item.option?.fragilePct,
                        targetValue: target,
                        preview: item.option?.preview ?? null,
                        scope: scopeImpact
                          ? {
                              matchesBefore: scopeImpact.totals.matchesBefore,
                              matchesAfter: scopeImpact.totals.matchesAfter,
                              nearMissBefore: scopeImpact.totals.nearMissBefore,
                              nearMissAfter: scopeImpact.totals.nearMissAfter,
                              assetsAffected: scopeImpact.totals.assetsAffected,
                            }
                          : undefined,
                      }) ?? null;
                    setPendingItem(item);
                  }}
                >
                  {item.action.label}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>


      {boundsViolations.length > 0 && (
        <p className="mt-2 text-[10px] text-destructive">
          Saving is blocked until these are resolved: {boundsViolations.join("; ")}.
        </p>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Applying a safer alternative asks you to confirm the before/after deltas first.
        Demo data — safer never means profitable.
      </p>

      <AlertDialog
        open={pendingItem !== null}
        onOpenChange={(o) => !o && setPendingItem(null)}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm mitigation</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingItem?.label} — review the near-miss risk and signal change before
              applying.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingItem && (
            <div className="space-y-2">
              <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground">
                {pendingItem.hint}
              </div>

              {(() => {
                const p = pendingItem.option?.preview ?? null;
                if (!p) {
                  return (
                    <div className="rounded-md border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
                      {pendingItem.option?.note ??
                        "No signal change — this only adjusts your risk tolerance settings."}
                    </div>
                  );
                }
                const dMatch = p.matchesAfter - p.matchesBefore;
                const dNear = p.nearMissAnyAfter - p.nearMissAnyBefore;
                const vsNear = tuning.preview
                  ? p.nearMissAnyAfter - tuning.preview.nearMissAnyAfter
                  : null;
                const vsMatch = tuning.preview
                  ? p.matchesAfter - tuning.preview.matchesAfter
                  : null;
                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md border border-border/60 bg-background/40 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Signals
                        </div>
                        <div className="text-sm font-semibold">
                          {p.matchesBefore} → {p.matchesAfter}{" "}
                          <span
                            className={cn(
                              "text-xs",
                              dMatch >= 0 ? "text-emerald-400" : "text-destructive",
                            )}
                          >
                            ({dMatch >= 0 ? "+" : ""}
                            {dMatch})
                          </span>
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-background/40 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Near-miss risk
                        </div>
                        <div className="text-sm font-semibold">
                          {p.nearMissAnyBefore} → {p.nearMissAnyAfter}{" "}
                          <span
                            className={cn(
                              "text-xs",
                              dNear <= 0 ? "text-emerald-400" : "text-destructive",
                            )}
                          >
                            ({dNear >= 0 ? "+" : ""}
                            {dNear})
                          </span>
                        </div>
                      </div>
                    </div>
                    <TuningDeltaChart
                      matchesBefore={p.matchesBefore}
                      matchesAfter={p.matchesAfter}
                      nearMissBefore={p.nearMissAnyBefore}
                      nearMissAfter={p.nearMissAnyAfter}
                    />
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      {pendingItem.option?.targetValue != null && (
                        <span>
                          New threshold: {meta.short} {meta.op === ">=" ? "≥" : "≤"}{" "}
                          {pendingItem.option.targetValue}
                          {meta.unit} (was {tuning.current}
                          {meta.unit})
                        </span>
                      )}
                      {pendingItem.option?.fragilePct != null && (
                        <span>Fragility {pendingItem.option.fragilePct.toFixed(0)}%</span>
                      )}
                      {vsMatch != null && vsNear != null && (
                        <span>
                          vs pending recommendation: signals {vsMatch >= 0 ? "+" : ""}
                          {vsMatch}, near-miss {vsNear >= 0 ? "+" : ""}
                          {vsNear}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {pendingItem.option?.targetValue != null && (
                <ScopeImpactPanel
                  impact={simulateScopeImpact(
                    result.perBucketSnapshots.flat(),
                    ruleKey,
                    pendingItem.option.targetValue,
                  )}
                  scopeLabel={SCOPE_LABEL[scopeOf(rules)] ?? scopeOf(rules)}
                />
              )}



              <p className="text-[10px] text-muted-foreground">
                Confirming saves this change immediately and logs it to the tuning audit
                trail. Demo data — safer never means profitable.
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const item = pendingItem;
                setPendingItem(null);
                item?.action?.run();
              }}
            >
              {pendingItem?.action?.label ?? "Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}


function TuningConfirmDialog({
  open,
  ruleKey,
  tuning,
  preset,
  result,
  rules,
  bounds,
  onSetBounds,
  onApplyAlternative,
  onLogBounds,
  onLogPreview,


  onCancel,
  onConfirm,
}: {
  open: boolean;
  ruleKey: RuleKey | null;
  tuning: RuleTuning | null;
  preset: "conservative" | "balanced" | "aggressive";
  result: ReplayResult;
  rules: ScannerRules;
  bounds: RiskBounds;
  onSetBounds: (fn: (b: RiskBounds) => RiskBounds) => void;
  onApplyAlternative: (
    value: number,
    preview: TuningPreview | null,
    label: string,
    meta: MitigationMeta,
  ) => void;
  onLogBounds: (e: {
    label: string;
    unit: string;
    oldValue: number;
    newValue: number;
    meta: MitigationMeta;
    preview: TuningPreview | null;
  }) => void;

  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!ruleKey || !tuning || tuning.suggested == null) {
    return (
      <AlertDialog open={false} onOpenChange={() => onCancel()}>
        <AlertDialogContent />
      </AlertDialog>
    );
  }
  const meta = RULE_META[ruleKey];
  const delta = tuning.suggested - tuning.current;
  const looser =
    (meta.op === ">=" && delta < 0) || (meta.op === "<=" && delta > 0);
  const p = tuning.preview;
  const nearMissDelta = p ? p.nearMissAnyAfter - p.nearMissAnyBefore : 0;
  const matchDelta = p ? p.matchesAfter - p.matchesBefore : 0;
  const fragilePct = tuning.unlocked
    ? (tuning.fragile / tuning.unlocked) * 100
    : 0;
  const riskTone =
    fragilePct >= 60
      ? "text-rose-300"
      : fragilePct >= 30
        ? "text-amber-300"
        : "text-emerald-300";

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm rule change</AlertDialogTitle>
          <AlertDialogDescription>
            This updates your live scanner rules. Alerts fired from now on use the
            new threshold — past deliveries are not changed.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Exact change
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-sm">
              <span className="text-muted-foreground">
                {meta.short} {meta.op} {tuning.current}
                {meta.unit}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className={cn("font-semibold", meta.textClass)}>
                {meta.short} {meta.op} {tuning.suggested}
                {meta.unit}
              </span>
              <span className="text-xs text-muted-foreground">
                ({delta >= 0 ? "+" : ""}
                {delta.toFixed(1)})
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Operator stays <span className="font-mono">{meta.op}</span> — only the
              threshold moves, {looser ? "loosening" : "tightening"} the rule (
              {preset} preset).
            </div>
          </div>

          {p && (
            <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Matches</div>
                <div className="mt-0.5 font-semibold">
                  {p.matchesBefore} → {p.matchesAfter}
                  <span
                    className={cn(
                      "ml-1 text-[10px]",
                      matchDelta > 0 ? "text-emerald-300" : "text-muted-foreground",
                    )}
                  >
                    {matchDelta >= 0 ? "+" : ""}
                    {matchDelta}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">
                  Near-miss (any)
                </div>
                <div className="mt-0.5 font-semibold">
                  {p.nearMissAnyBefore} → {p.nearMissAnyAfter}
                  <span
                    className={cn(
                      "ml-1 text-[10px]",
                      nearMissDelta > 0 ? "text-rose-300" : "text-emerald-300",
                    )}
                  >
                    {nearMissDelta >= 0 ? "+" : ""}
                    {nearMissDelta}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Fragile</div>
                <div className={cn("mt-0.5 font-semibold", riskTone)}>
                  {tuning.fragile}/{tuning.unlocked}
                  <span className="ml-1 text-[10px]">({fragilePct.toFixed(0)}%)</span>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" /> Near-miss risk warning
            </div>
            <p className="mt-1 leading-relaxed">
              {nearMissDelta > 0
                ? `This loosening pushes ${nearMissDelta} more snapshot${nearMissDelta > 1 ? "s" : ""} into the near-miss band — they will sit one rule away from firing, so small market noise can flip them on and off.`
                : "Near-miss count does not rise in this window, but a different window may behave differently."}{" "}
              {fragilePct >= 30
                ? `${fragilePct.toFixed(0)}% of the newly unlocked matches also nearly failed another rule (avg other-rule slack ${tuning.avgOtherMinSlack.toFixed(1)}), so expect noisier, less reliable alerts.`
                : `Unlocked matches keep healthy margin on other rules (avg slack ${tuning.avgOtherMinSlack.toFixed(1)}).`}
            </p>
            <p className="mt-1 text-[11px] text-amber-200/80">
              More matches never means more profit. Signals are probabilistic on demo
              data — you can still lose all capital.
            </p>
          </div>

          <MitigationChecklist
            ruleKey={ruleKey}
            tuning={tuning}
            result={result}
            rules={rules}
            bounds={bounds}
            onSetBounds={onSetBounds}
            onApplyAlternative={onApplyAlternative}
            onLogBounds={onLogBounds}
            onLogPreview={onLogPreview}
          />

        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={checkBounds(tuning, bounds).length > 0}
          >
            Save {meta.short} {meta.op} {tuning.suggested}
            {meta.unit}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type AutoConfig = {
  /** Auto-replay interval in minutes; 0 = off. */
  intervalMin: number;
  /** Auto-apply in-bounds recommendations after each replay. */
  apply: boolean;
  preset: "conservative" | "balanced" | "aggressive";
  maxPerRun: number;
};

const DEFAULT_AUTO: AutoConfig = {
  intervalMin: 0,
  apply: false,
  preset: "conservative",
  maxPerRun: 1,
};

const AUTO_KEY = "pumppilot_replay_automation";

function loadAuto(): AutoConfig {
  if (typeof window === "undefined") return DEFAULT_AUTO;
  try {
    const raw = window.localStorage.getItem(AUTO_KEY);
    return raw
      ? { ...DEFAULT_AUTO, ...(JSON.parse(raw) as Partial<AutoConfig>) }
      : DEFAULT_AUTO;
  } catch {
    return DEFAULT_AUTO;
  }
}


function ReplayPanel() {
  const {
    scannerRules,
    setScannerRules,
    tuningLog,
    logTuning,
    clearTuningLog,
    markTuningReverted,
  } = usePaper();
  const [windowKey, setWindowKey] = useState<WindowKey>("24h");
  const [steps, setSteps] = useState(30);
  const [assetFilter, setAssetFilter] = useState<"all" | "major" | "demo-smallcap">("all");
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [ruleFocus, setRuleFocus] = useState<RuleKey | null>(null);
  const [openBucket, setOpenBucket] = useState<number | null>(null);

  const [auto, setAuto] = useState<AutoConfig>(loadAuto);
  /** Snapshot taken right before a mitigation apply, so it can be undone in one tap. */
  const [mitigationUndo, setMitigationUndo] = useState<{
    ts: number;
    before: ScannerRules;
    ids: string[];
    label: string;
    detail: string;
  } | null>(null);
  const undoMitigation = () => {
    if (!mitigationUndo) return;
    setScannerRules(mitigationUndo.before);
    for (const id of mitigationUndo.ids) markTuningReverted(id);
    logTuning({
      source: "mitigation",
      kind: "rule",
      rule: "undo",
      ruleLabel: "Undo mitigation",
      operator: ">=",
      unit: "",
      oldValue: 0,
      newValue: 0,
      preset: "undo",
      scope: scopeOf(mitigationUndo.before),
      mitigation: `Undo: ${mitigationUndo.label}`,
      trigger: `Restored original parameters — ${mitigationUndo.detail}`,
    });
    toast.success("Mitigation undone — original parameters restored", {
      description: mitigationUndo.detail,
    });
    setMitigationUndo(null);
  };
  const lastAutoRef = useRef<number | null>(null);
  const runRef = useRef<() => void>(() => {});

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_KEY, JSON.stringify(auto));
    } catch {}
  }, [auto]);

  const run = () => {
    const r = runReplay(scannerRules, windowKey, steps);
    setResult(r);
    if (r.signals.length === 0) {
      toast.message("Replay finished — no matches for current rules in this window");
    } else {
      const uniq = new Set(r.signals.map((s) => s.symbol)).size;
      toast.success(
        `Replay: ${r.signals.length} signal${r.signals.length === 1 ? "" : "s"} across ${uniq} asset${uniq === 1 ? "" : "s"}`,
      );
    }
    setRuleFocus(null);
  };
  runRef.current = run;

  const applyTuning = (
    k: RuleKey,
    value: number,
    meta: { preset: string; preview: TuningPreview | null },
    windowLabel: WindowKey,
    base: ScannerRules,
  ): ScannerRules => {
    const next: ScannerRules = { ...base };
    const current =
      k === "momentum"
        ? base.minMomentum
        : k === "volume"
          ? base.minVolumeScore
          : k === "volatility"
            ? base.maxVolatility
            : base.min24hChangePct;
    if (k === "momentum") next.minMomentum = value;
    else if (k === "volume") next.minVolumeScore = value;
    else if (k === "volatility") next.maxVolatility = value;
    else next.min24hChangePct = value;
    logTuning({
      source: meta.preset.startsWith("auto") ? "auto" : "recommendation",
      rule: k,

      ruleLabel: RULE_META[k].short,
      operator: RULE_META[k].op,
      unit: RULE_META[k].unit,
      oldValue: current,
      newValue: value,
      preset: meta.preset,
      scope: scopeOf(next),

      window: windowLabel,
      matchesBefore: meta.preview?.matchesBefore,
      matchesAfter: meta.preview?.matchesAfter,
      nearMissBefore: meta.preview?.nearMissAnyBefore,
      nearMissAfter: meta.preview?.nearMissAnyAfter,
    });
    return next;
  };

  // Scheduled auto-replay
  useEffect(() => {
    if (!auto.intervalMin) return;
    const id = setInterval(() => runRef.current(), auto.intervalMin * 60_000);
    return () => clearInterval(id);
  }, [auto.intervalMin]);

  // Auto-apply in-bounds recommendations after each replay
  useEffect(() => {
    if (!auto.apply || !result) return;
    if (lastAutoRef.current === result.ranAt) return;
    lastAutoRef.current = result.ranAt;
    const bounds = loadBounds();
    const fraction =
      auto.preset === "conservative" ? 0.25 : auto.preset === "aggressive" ? 0.9 : 0.5;
    const tuning = computeTuning(result, scannerRules, fraction);
    const keys: RuleKey[] = ["momentum", "volume", "volatility", "change"];
    let base = scannerRules;
    const applied: string[] = [];
    for (const k of keys) {
      if (applied.length >= auto.maxPerRun) break;
      const t = tuning[k];
      if (t.suggested == null) continue;
      if (checkBounds(t, bounds).length > 0) continue;
      base = applyTuning(
        k,
        t.suggested,
        { preset: `auto·${auto.preset}`, preview: t.preview },
        result.window,
        base,
      );
      applied.push(`${RULE_META[k].short} ${RULE_META[k].op} ${t.suggested}${RULE_META[k].unit}`);
    }
    if (applied.length) {
      setScannerRules(base);
      toast.success(`Automation applied ${applied.length} in-bounds change(s): ${applied.join(", ")}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, auto.apply, auto.preset, auto.maxPerRun]);


  const filteredSignals = useMemo(() => {
    if (!result) return [];
    let s = result.signals;
    if (assetFilter !== "all") s = s.filter((x) => x.category === assetFilter);
    if (ruleFocus) s = s.filter((x) => x.binding === ruleFocus);
    return s;
  }, [result, assetFilter, ruleFocus]);

  const filteredBuckets = useMemo(() => {
    if (!result) return [] as number[];
    if (!ruleFocus && assetFilter === "all") return result.perBucket;
    const buckets = new Array(result.steps).fill(0);
    const spanMs = WINDOW_MS[result.window];
    const stepMs = spanMs / result.steps;
    const start = result.ranAt - spanMs;
    for (const s of filteredSignals) {
      const i = Math.min(result.steps - 1, Math.max(0, Math.floor((s.ts - start) / stepMs)));
      buckets[i]++;
    }
    return buckets;
  }, [result, filteredSignals, ruleFocus, assetFilter]);


  const bySymbol = useMemo(() => {
    const map = new Map<string, ReplaySignal[]>();
    for (const s of filteredSignals) {
      const arr = map.get(s.symbol) ?? [];
      arr.push(s);
      map.set(s.symbol, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredSignals]);

  const maxBucket = filteredBuckets.length ? Math.max(1, ...filteredBuckets) : 1;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Replay window</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Time window</Label>
            <ToggleGroup
              type="single"
              value={windowKey}
              onValueChange={(v) => v && setWindowKey(v as WindowKey)}
              className="flex-wrap justify-start"
              size="sm"
            >
              {(Object.keys(WINDOW_MS) as WindowKey[]).map((k) => (
                <ToggleGroupItem key={k} value={k} aria-label={WINDOW_LABEL[k]}>
                  {k}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Snapshots to evaluate</Label>
              <span className="font-mono text-xs text-emerald-300">{steps}</span>
            </div>
            <Slider
              value={[steps]}
              onValueChange={(v) => setSteps(v[0])}
              min={10}
              max={60}
              step={5}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Asset scope</Label>
            <ToggleGroup
              type="single"
              value={assetFilter}
              onValueChange={(v) => v && setAssetFilter(v as typeof assetFilter)}
              size="sm"
              className="flex-wrap justify-start"
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="major">Majors</ToggleGroupItem>
              <ToggleGroupItem value="demo-smallcap">Demo</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            Replays synthesize price and momentum snapshots from demo history and evaluate them
            against your saved scanner rules (momentum ≥ {scannerRules.minMomentum}, vol ≥{" "}
            {scannerRules.minVolumeScore}, volatility ≤ {scannerRules.maxVolatility}, 24h ≥{" "}
            {scannerRules.min24hChangePct}%). Cooldown {scannerRules.cooldownMinutes}m applied per
            asset.
          </div>

          <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Automation</Label>
              {auto.intervalMin > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  every {auto.intervalMin}m
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Auto-replay schedule</Label>
              <ToggleGroup
                type="single"
                value={String(auto.intervalMin)}
                onValueChange={(v) => v && setAuto((a) => ({ ...a, intervalMin: Number(v) }))}
                size="sm"
                className="flex-wrap justify-start"
              >
                <ToggleGroupItem value="0">Off</ToggleGroupItem>
                <ToggleGroupItem value="5">5m</ToggleGroupItem>
                <ToggleGroupItem value="15">15m</ToggleGroupItem>
                <ToggleGroupItem value="60">1h</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs">Auto-apply in-bounds tuning</div>
                <div className="text-[11px] text-muted-foreground">
                  Only recommendations that pass your near-miss risk bounds
                </div>
              </div>
              <Switch
                checked={auto.apply}
                onCheckedChange={(v) => setAuto((a) => ({ ...a, apply: v }))}
              />
            </div>

            {auto.apply && (
              <div className="space-y-2 border-t border-border/60 pt-2">
                <ToggleGroup
                  type="single"
                  value={auto.preset}
                  onValueChange={(v) =>
                    v && setAuto((a) => ({ ...a, preset: v as AutoConfig["preset"] }))
                  }
                  size="sm"
                  className="flex-wrap justify-start"
                >
                  <ToggleGroupItem value="conservative">Conservative</ToggleGroupItem>
                  <ToggleGroupItem value="balanced">Balanced</ToggleGroupItem>
                  <ToggleGroupItem value="aggressive">Aggressive</ToggleGroupItem>
                </ToggleGroup>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">
                    Max changes per replay
                  </Label>
                  <span className="font-mono text-xs text-emerald-300">{auto.maxPerRun}</span>
                </div>
                <Slider
                  value={[auto.maxPerRun]}
                  onValueChange={(v) => setAuto((a) => ({ ...a, maxPerRun: v[0] }))}
                  min={1}
                  max={4}
                  step={1}
                />
                <p className="text-[11px] text-amber-200/80">
                  Automated changes are logged in Tuning history and can be reverted. Demo data
                  only — signals are probabilistic and you can lose all capital.
                </p>
              </div>
            )}
          </div>

          <Button onClick={run} className="w-full">
            <PlayCircle className="mr-2 h-4 w-4" /> Run replay
          </Button>

        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span>Replay results</span>
            <div className="flex items-center gap-2">
              {result && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => exportReplaySignalsCsv(result, filteredSignals, scannerRules)}
                    disabled={filteredSignals.length === 0}
                    title="Download filtered signals as CSV"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Signals
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => exportRuleImpactCsv(result, scannerRules)}
                    title="Download rule-impact stats as CSV"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Impact
                  </Button>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
                    {filteredSignals.length} signal{filteredSignals.length === 1 ? "" : "s"}
                  </Badge>
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Choose a window and press Run replay to see which assets would have matched.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <StatTile label="Window" value={WINDOW_LABEL[result.window]} />
                <StatTile
                  label="Assets triggered"
                  value={String(new Set(filteredSignals.map((s) => s.symbol)).size)}
                />
                <StatTile
                  label="Evaluations"
                  value={result.evaluatedSnapshots.toLocaleString()}
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Signal timeline</Label>
                  <span className="text-[10px] text-muted-foreground">Tap a bar to inspect</span>
                </div>
                <div className="mt-2 flex h-16 items-end gap-[2px] rounded-md border border-border/60 bg-muted/20 p-2">
                  {filteredBuckets.map((n, i) => {
                    const snaps = result.perBucketSnapshots[i] ?? [];
                    const hasAny = snaps.length > 0;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => hasAny && setOpenBucket(i)}
                        disabled={!hasAny}
                        className={`group relative flex-1 rounded-sm transition hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-emerald-400/60 disabled:cursor-not-allowed ${
                          n > 0
                            ? ruleFocus
                              ? RULE_META[ruleFocus].barClass
                              : "bg-emerald-500/70"
                            : hasAny
                              ? "bg-muted-foreground/25"
                              : "bg-muted-foreground/10"
                        }`}
                        style={{
                          height: n > 0 ? `${(n / maxBucket) * 100}%` : hasAny ? "6%" : "3%",
                          minHeight: n ? 2 : hasAny ? 2 : 1,
                        }}
                        title={`${n} match${n === 1 ? "" : "es"} · ${snaps.length} evaluation${snaps.length === 1 ? "" : "s"}`}
                        aria-label={`Bucket ${i + 1}: ${n} matches, ${snaps.length} evaluations`}
                      />
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>{format(new Date(result.ranAt - WINDOW_MS[result.window]), "MMM d HH:mm")}</span>
                  <span>{format(new Date(result.ranAt), "MMM d HH:mm")}</span>
                </div>
              </div>

              <SnapshotBucketDialog
                open={openBucket !== null}
                onOpenChange={(v) => !v && setOpenBucket(null)}
                bucketIndex={openBucket}
                result={result}
                rules={scannerRules}
              />

              <RuleImpactPanel
                result={result}
                rules={scannerRules}
                focus={ruleFocus}
                onFocus={setRuleFocus}
              />

              <RuleTuningPanel
                result={result}
                rules={scannerRules}
                mitigationUndo={
                  mitigationUndo
                    ? { label: mitigationUndo.label, detail: mitigationUndo.detail, ts: mitigationUndo.ts }
                    : null
                }
                onUndoMitigation={undoMitigation}
                onApply={(k, value, meta) => {
                  const next: ScannerRules = { ...scannerRules };
                  const current =
                    k === "momentum"
                      ? scannerRules.minMomentum
                      : k === "volume"
                        ? scannerRules.minVolumeScore
                        : k === "volatility"
                          ? scannerRules.maxVolatility
                          : scannerRules.min24hChangePct;
                  if (k === "momentum") next.minMomentum = value;
                  else if (k === "volume") next.minVolumeScore = value;
                  else if (k === "volatility") next.maxVolatility = value;
                  else next.min24hChangePct = value;
                  setScannerRules(next);
                  const id = logTuning({
                    source: meta.mitigation ? "mitigation" : "recommendation",
                    kind: "rule",
                    rule: k,
                    ruleLabel: RULE_META[k].short,
                    operator: RULE_META[k].op,
                    unit: RULE_META[k].unit,
                    oldValue: current,
                    newValue: value,
                    preset: meta.preset,
                    scope: scopeOf(next),
                    mitigation: meta.mitigation,
                    trigger: meta.trigger,
                    recommendedValue: meta.recommendedValue,
                    fragilePct: meta.fragilePct,

                    window: result.window,
                    matchesBefore: meta.preview?.matchesBefore,
                    matchesAfter: meta.preview?.matchesAfter,
                    nearMissBefore: meta.preview?.nearMissAnyBefore,
                    nearMissAfter: meta.preview?.nearMissAnyAfter,
                  });
                  if (meta.mitigation) {
                    const detail = `${RULE_META[k].short} back to ${current}${RULE_META[k].unit}`;
                    setMitigationUndo({
                      ts: Date.now(),
                      before: scannerRules,
                      ids: [id],
                      label: meta.mitigation,
                      detail,
                    });
                  }
                  toast.success(
                    `Applied ${RULE_META[k].short} ${RULE_META[k].op} ${value}${RULE_META[k].unit} — run replay to preview`,
                    meta.mitigation
                      ? { description: `Mitigation logged: ${meta.mitigation}` }
                      : undefined,
                  );
                }}
                onApplyBulk={(entries) => {
                  if (entries.length === 0) return;
                  const next: ScannerRules = { ...scannerRules };
                  const olds: Record<string, number> = {};
                  for (const e of entries) {
                    const k = e.key;
                    olds[k] =
                      k === "momentum"
                        ? scannerRules.minMomentum
                        : k === "volume"
                          ? scannerRules.minVolumeScore
                          : k === "volatility"
                            ? scannerRules.maxVolatility
                            : scannerRules.min24hChangePct;
                    if (k === "momentum") next.minMomentum = e.value;
                    else if (k === "volume") next.minVolumeScore = e.value;
                    else if (k === "volatility") next.maxVolatility = e.value;
                    else next.min24hChangePct = e.value;
                  }
                  setScannerRules(next);
                  const ids: string[] = [];
                  for (const e of entries) {
                    ids.push(logTuning({
                      source: "mitigation",
                      kind: "rule",
                      rule: e.key,
                      ruleLabel: RULE_META[e.key].short,
                      operator: RULE_META[e.key].op,
                      unit: RULE_META[e.key].unit,
                      oldValue: olds[e.key],
                      newValue: e.value,
                      preset: e.preset,
                      scope: scopeOf(next),
                      mitigation: e.mitigation,
                      trigger: e.trigger,
                      recommendedValue: e.recommendedValue,
                      fragilePct: e.fragilePct,
                      window: result.window,
                      matchesBefore: e.preview?.matchesBefore,
                      matchesAfter: e.preview?.matchesAfter,
                      nearMissBefore: e.preview?.nearMissAnyBefore,
                      nearMissAfter: e.preview?.nearMissAnyAfter,
                    }));
                  }
                  setMitigationUndo({
                    ts: Date.now(),
                    before: scannerRules,
                    ids,
                    label: `Bulk safer alternatives (${entries.length} rules)`,
                    detail: entries
                      .map((e) => `${RULE_META[e.key].short} back to ${olds[e.key]}${RULE_META[e.key].unit}`)
                      .join(" · "),
                  });
                  toast.success(
                    `Applied safer alternatives to ${entries.length} rule${entries.length === 1 ? "" : "s"}`,
                    {
                      description: `${entries
                        .map((e) => `${RULE_META[e.key].short} ${RULE_META[e.key].op} ${e.value}${RULE_META[e.key].unit}`)
                        .join(" · ")} — logged to the audit trail.`,
                    },
                  );
                }}
                onLogBoundsChange={(e) => {
                  logTuning({
                    source: "mitigation",
                    kind: "bounds",
                    rule: `bounds:${e.label.toLowerCase().replace(/\s+/g, "-")}`,
                    ruleLabel: e.label,
                    operator: ">=",
                    unit: e.unit,
                    oldValue: e.oldValue,
                    newValue: e.newValue,
                    preset: "risk-bounds",
                    scope: scopeOf(scannerRules),
                    mitigation: e.mitigation,
                    trigger: e.trigger,
                    recommendedValue: e.recommendedValue,
                    fragilePct: e.fragilePct,
                    window: e.window,
                    matchesBefore: e.preview?.matchesBefore,
                    matchesAfter: e.preview?.matchesAfter,
                    nearMissBefore: e.preview?.nearMissAnyBefore,
                    nearMissAfter: e.preview?.nearMissAnyAfter,
                  });
                  toast.success(`${e.label} updated to ${e.newValue}${e.unit}`, {
                    description: `Logged to the tuning audit trail (was ${e.oldValue}${e.unit}).`,
                  });
                }}

              />

              <TuningHistoryPanel
                log={tuningLog}
                onClear={clearTuningLog}
                onRevert={(e) => {
                  const next: ScannerRules = { ...scannerRules };
                  const k = e.rule as RuleKey;
                  if (k === "momentum") next.minMomentum = e.oldValue;
                  else if (k === "volume") next.minVolumeScore = e.oldValue;
                  else if (k === "volatility") next.maxVolatility = e.oldValue;
                  else next.min24hChangePct = e.oldValue;
                  setScannerRules(next);
                  markTuningReverted(e.id);
                  toast.success(
                    `Reverted ${e.ruleLabel} back to ${e.operator === ">=" ? "≥" : "≤"} ${e.oldValue}${e.unit}`,
                  );
                }}
                onRollbackLast={(batch, reason) => {
                  if (batch.length === 0) return;
                  const snapshot = scannerRules;
                  setScannerRules(rollbackBatch(scannerRules, batch));
                  for (const e of batch) markTuningReverted(e.id, reason);
                  toast.success(
                    `Rolled back last change — restored ${batch
                      .map(
                        (e) =>
                          `${e.ruleLabel} ${e.operator === ">=" ? "≥" : "≤"} ${e.oldValue}${e.unit}`,
                      )
                      .join(", ")}`,
                    {
                      duration: 10000,
                      action: {
                        label: "Undo",
                        onClick: () => {
                          setScannerRules(snapshot);
                          toast.success("Rollback undone — tuned thresholds restored");
                        },
                      },
                    },
                  );
                }}

              />


              {bySymbol.length === 0 ? (
                <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                  No matches under current filters.
                </div>
              ) : (
                <div className="max-h-[420px] divide-y divide-border/60 overflow-y-auto rounded-md border border-border/60">
                  {bySymbol.map(([symbol, sigs]) => (
                    <ReplayAssetRow key={symbol} symbol={symbol} signals={sigs} />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function ReplayAssetRow({
  symbol,
  signals,
}: {
  symbol: string;
  signals: ReplaySignal[];
}) {
  const first = signals[0];
  const peak = signals.reduce((a, b) => (b.momentum > a.momentum ? b : a), signals[0]);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{symbol}</span>
            {first.category === "demo-smallcap" && (
              <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-300">
                DEMO
              </Badge>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            First match {format(new Date(first.ts), "MMM d HH:mm")} · peak momentum {peak.momentum}
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
          {signals.length} hit{signals.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {signals.slice(0, 8).map((s, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-[10px]"
            title={`Momentum ${s.momentum} · vol ${s.volumeScore} · volatility ${s.volatility} · 24h ${s.change.toFixed(2)}%`}
          >
            <span className="text-muted-foreground">{format(new Date(s.ts), "HH:mm")}</span>
            <span className="text-emerald-300">m{s.momentum}</span>
            <span className={s.change >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {s.change >= 0 ? "+" : ""}
              {s.change.toFixed(1)}%
            </span>
          </span>
        ))}
        {signals.length > 8 && (
          <span className="text-[10px] text-muted-foreground">+{signals.length - 8} more</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Rule Impact ------------------------------ */

const RULE_META: Record<
  RuleKey,
  {
    label: string;
    short: string;
    op: ">=" | "<=";
    unit: string;
    barClass: string;
    textClass: string;
    accent: string;
  }
> = {
  momentum: {
    label: "Momentum ≥",
    short: "Momentum",
    op: ">=",
    unit: "",
    barClass: "bg-emerald-500/70",
    textClass: "text-emerald-300",
    accent: "border-emerald-500/40",
  },
  volume: {
    label: "Volume ≥",
    short: "Volume",
    op: ">=",
    unit: "",
    barClass: "bg-sky-500/70",
    textClass: "text-sky-300",
    accent: "border-sky-500/40",
  },
  volatility: {
    label: "Volatility ≤",
    short: "Volatility",
    op: "<=",
    unit: "",
    barClass: "bg-violet-500/70",
    textClass: "text-violet-300",
    accent: "border-violet-500/40",
  },
  change: {
    label: "24h change ≥",
    short: "24h Δ",
    op: ">=",
    unit: "%",
    barClass: "bg-amber-500/70",
    textClass: "text-amber-300",
    accent: "border-amber-500/40",
  },
};

function ruleThreshold(rules: ScannerRules, k: RuleKey) {
  if (k === "momentum") return rules.minMomentum;
  if (k === "volume") return rules.minVolumeScore;
  if (k === "volatility") return rules.maxVolatility;
  return rules.min24hChangePct;
}

function RuleImpactPanel({
  result,
  rules,
  focus,
  onFocus,
}: {
  result: ReplayResult;
  rules: ScannerRules;
  focus: RuleKey | null;
  onFocus: (k: RuleKey | null) => void;
}) {
  const totalMatches = result.signals.length;
  const keys: RuleKey[] = ["momentum", "volume", "volatility", "change"];
  const maxBinding = Math.max(1, ...keys.map((k) => result.impact[k].bindingMatches));
  const maxUnlock = Math.max(1, ...keys.map((k) => result.impact[k].failedOnly));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-xs">Rule impact</Label>
        {focus && (
          <button
            type="button"
            onClick={() => onFocus(null)}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear focus
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {keys.map((k) => {
          const meta = RULE_META[k];
          const imp = result.impact[k];
          const bindPct = totalMatches ? (imp.bindingMatches / totalMatches) * 100 : 0;
          const isFocus = focus === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onFocus(isFocus ? null : k)}
              className={`group rounded-lg border p-3 text-left transition ${
                isFocus
                  ? `${meta.accent} bg-muted/40`
                  : "border-border/60 bg-muted/20 hover:border-border"
              }`}
              title={
                imp.failedOnly > 0
                  ? `${imp.failedOnly} snapshot${imp.failedOnly === 1 ? "" : "s"} failed only this rule — loosening it would unlock them`
                  : "No snapshots failed only this rule"
              }
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${meta.textClass}`}>{meta.short}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {meta.op} {ruleThreshold(rules, k)}
                  {meta.unit}
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                <div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Binding on matches</span>
                    <span className="font-mono">
                      {imp.bindingMatches} ({bindPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted/60">
                    <div
                      className={`h-full rounded-full ${meta.barClass}`}
                      style={{ width: `${(imp.bindingMatches / maxBinding) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Near-miss (only-fail)</span>
                    <span className="font-mono">{imp.failedOnly}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted/60">
                    <div
                      className={`h-full rounded-full ${meta.barClass} opacity-60`}
                      style={{ width: `${(imp.failedOnly / maxUnlock) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>avg slack</span>
                <span className={`font-mono ${meta.textClass}`}>
                  {imp.avgSlack >= 0 ? "+" : ""}
                  {imp.avgSlack.toFixed(1)}
                  {meta.unit}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Tap a rule to filter the timeline and asset list to matches it bound. Near-miss counts
        snapshots that failed only that rule — the biggest lever to unlock more signals.
      </p>
    </div>
  );
}

/* ---------------------- Snapshot inspector modal ---------------------- */

function ruleComparisonLine(
  k: RuleKey,
  snap: BucketSnapshot,
  rules: ScannerRules,
): { label: string; observed: number; threshold: number; slack: number; passed: boolean; unit: string } {
  const meta = RULE_META[k];
  const threshold = ruleThreshold(rules, k);
  const observed =
    k === "momentum" ? snap.momentum
    : k === "volume" ? snap.volumeScore
    : k === "volatility" ? snap.volatility
    : snap.change;
  return {
    label: meta.label + ` ${threshold}${meta.unit}`,
    observed,
    threshold,
    slack: snap.slack[k],
    passed: snap.slack[k] >= 0,
    unit: meta.unit,
  };
}

function SnapshotBucketDialog({
  open,
  onOpenChange,
  bucketIndex,
  result,
  rules,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bucketIndex: number | null;
  result: ReplayResult;
  rules: ScannerRules;
}) {
  const snaps =
    bucketIndex == null ? [] : result.perBucketSnapshots[bucketIndex] ?? [];
  const spanMs = WINDOW_MS[result.window];
  const stepMs = spanMs / result.steps;
  const bucketStart =
    bucketIndex == null ? 0 : result.ranAt - spanMs + bucketIndex * stepMs;
  const bucketEnd = bucketStart + stepMs;

  const matched = snaps.filter((s) => s.outcome === "match");
  const failed = snaps.filter((s) => s.outcome === "fail");
  const cooled = snaps.filter((s) => s.outcome === "cooldown");

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setExpanded({});
  }, [bucketIndex]);

  const keyOf = (s: BucketSnapshot) => `${s.symbol}-${s.ts}`;

  const renderSnap = (s: BucketSnapshot) => {
    const k = keyOf(s);
    const isOpen = expanded[k] ?? false;
    const rows = (Object.keys(RULE_META) as RuleKey[]).map((rk) => ({
      key: rk,
      ...ruleComparisonLine(rk, s, rules),
    }));
    return (
      <div
        key={k}
        className="rounded-md border border-border/60 bg-muted/20 px-3 py-2"
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setExpanded((p) => ({ ...p, [k]: !isOpen }))}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm font-semibold">{s.symbol}</span>
            {s.category === "demo-smallcap" && (
              <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-300">
                DEMO
              </Badge>
            )}
            <Badge
              variant="outline"
              className={
                s.outcome === "match"
                  ? "border-emerald-500/40 text-[10px] text-emerald-300"
                  : s.outcome === "cooldown"
                    ? "border-sky-500/40 text-[10px] text-sky-300"
                    : "border-rose-500/40 text-[10px] text-rose-300"
              }
            >
              {s.outcome === "match"
                ? "Matched"
                : s.outcome === "cooldown"
                  ? `Cooldown ${Math.ceil((s.cooldownRemainingMs ?? 0) / 60000)}m`
                  : `Failed ${s.failedRules.length}/4`}
            </Badge>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {format(new Date(s.ts), "HH:mm:ss")}
            <ChevronRight
              className={`ml-1 inline h-3 w-3 transition ${isOpen ? "rotate-90" : ""}`}
            />
          </span>
        </button>
        {isOpen && (
          <div className="mt-2 space-y-1.5 border-t border-border/40 pt-2">
            {rows.map((r) => {
              const meta = RULE_META[r.key];
              const slackAbs = Math.abs(r.slack).toFixed(r.unit === "%" ? 2 : 1);
              return (
                <div
                  key={r.key}
                  className="flex items-center justify-between gap-3 rounded-sm bg-background/40 px-2 py-1 text-[11px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {r.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                    )}
                    <span className={`truncate ${meta.textClass}`}>{r.label}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-muted-foreground">
                      obs{" "}
                      <span className="text-foreground">
                        {r.observed.toFixed(r.unit === "%" ? 2 : 0)}
                        {r.unit}
                      </span>
                    </span>
                    <span className={r.passed ? "text-emerald-300" : "text-rose-300"}>
                      {r.passed ? "+" : "−"}
                      {slackAbs}
                      {r.unit}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="pt-1 text-[10px] text-muted-foreground">
              Price {s.price.toFixed(s.price < 10 ? 4 : 2)} · momentum {s.momentum} · vol{" "}
              {s.volumeScore} · volatility {s.volatility} · 24h{" "}
              {s.change >= 0 ? "+" : ""}
              {s.change.toFixed(2)}%
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Snapshot bucket
            {bucketIndex != null && (
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                {format(new Date(bucketStart), "MMM d HH:mm:ss")} →{" "}
                {format(new Date(bucketEnd), "HH:mm:ss")}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {snaps.length} evaluation{snaps.length === 1 ? "" : "s"} against your saved rules ·{" "}
            <span className="text-emerald-300">{matched.length} matched</span>
            {cooled.length > 0 && (
              <>
                {" "}
                · <span className="text-sky-300">{cooled.length} cooled</span>
              </>
            )}
            {failed.length > 0 && (
              <>
                {" "}
                · <span className="text-rose-300">{failed.length} failed</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {matched.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                Matched ({matched.length})
              </h4>
              {matched.map(renderSnap)}
            </section>
          )}
          {cooled.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                Suppressed by cooldown ({cooled.length})
              </h4>
              {cooled.map(renderSnap)}
            </section>
          )}
          {failed.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-300">
                Failed rule checks ({failed.length})
              </h4>
              {failed.map(renderSnap)}
            </section>
          )}
          {snaps.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No evaluations in this bucket.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
