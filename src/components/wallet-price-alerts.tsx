// Wallet price / threshold alerts — monitoring only, no trade execution.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BellRing, Plus, Trash2, ShieldOff, Mail, Smartphone, MessageSquare, Send, BellOff, Download } from "lucide-react";
import { toast } from "sonner";
import { useLivePriceMap, useLivePrices } from "@/lib/market-data";
import { useInjectedAccount, useWalletBalances } from "@/lib/wallet-balances";
import {
  ALERT_KIND_LABELS,
  addRule,
  clearEvents,
  describeRule,
  isPriceKind,
  isMoveKind,
  isRuleMuted,
  formatCooldown,
  muteRule,
  unmuteRule,
  COOLDOWN_PRESETS,
  MUTE_PRESETS,
  removeRule,
  updateRule,
  useWalletAlertEvents,
  useWalletAlertRules,
  useWalletAlertWatcher,
  type WalletAlertKind,
} from "@/lib/wallet-alerts";
import {
  CHANNEL_HINTS,
  CHANNEL_LABELS,
  dispatchAlert,
  requestPushPermissionForAlerts,
  setChannel,
  useAlertChannels,
  type AlertChannelPrefs,
} from "@/lib/wallet-alert-channels";
import { reasonLabel, useDeliveryLog } from "@/lib/notify-log";
import { deliveriesToCsv, notifyLogFilename } from "@/lib/notify-log-export";
import { downloadCsv } from "@/lib/wallet-export";

const KINDS: WalletAlertKind[] = [
  "price_above",
  "price_below",
  "change_up",
  "change_down",
  "move_up",
  "move_down",
];

export function WalletPriceAlerts() {
  const { address } = useInjectedAccount();
  const { data } = useWalletBalances(address);
  const prices = useLivePriceMap();
  const { dataUpdatedAt } = useLivePrices();

  const held = (data?.balances ?? [])
    .map((b) => b.symbol)
    .filter((s, i, arr) => arr.indexOf(s) === i && Boolean(prices[s]));
  const symbols = held.length ? held : Object.keys(prices).slice(0, 6);

  useWalletAlertWatcher(prices, symbols, dataUpdatedAt);

  const rules = useWalletAlertRules();
  const events = useWalletAlertEvents();

  const [symbol, setSymbol] = useState(symbols[0] ?? "BTC");
  const [kind, setKind] = useState<WalletAlertKind>("price_above");
  const [value, setValue] = useState("");
  const [cooldown, setCooldown] = useState("30");
  const [testing, setTesting] = useState(false);
  const channels = useAlertChannels();
  const deliveries = useDeliveryLog().filter((d) => d.title.toLowerCase().includes("price alert"));

  const onToggleChannel = async (key: keyof AlertChannelPrefs, next: boolean) => {
    if (key === "push" && next) {
      const perm = await requestPushPermissionForAlerts();
      if (perm !== "granted") {
        toast.error(
          perm === "unsupported"
            ? "Push notifications are not supported on this device"
            : "Notification permission was not granted",
        );
        return;
      }
    }
    setChannel(key, next);
    toast.success(`${CHANNEL_LABELS[key]} ${next ? "enabled" : "disabled"} for price alerts`);
  };

  const onTest = async () => {
    setTesting(true);
    const results = await dispatchAlert({
      correlationId: `test-${Date.now().toString(36)}`,
      symbol: activeSymbolForTest(symbols, symbol),
      message: `Test alert — delivery check only, no market condition met`,
      ts: Date.now(),
      address: address ?? undefined,
      test: true,
    });
    setTesting(false);
    const sent = results.filter((r) => r.ok).map((r) => r.channel);
    toast[sent.length ? "success" : "error"](
      sent.length ? `Test alert sent via ${sent.join(", ")}` : "No channel accepted the test alert",
      { description: "Check the delivery log below for per-channel details." },
    );
  };

  const activeSymbol = symbols.includes(symbol) ? symbol : (symbols[0] ?? "BTC");
  const live = prices[activeSymbol];

  const onAdd = () => {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      toast.error("Enter a numeric threshold");
      return;
    }
    addRule({
      symbol: activeSymbol,
      kind,
      value: num,
      cooldownMinutes: Math.max(1, Number(cooldown) || 30),
    });
    setValue("");
    toast.success(`Alert added for ${activeSymbol} — notifications only`);
  };

  return (
    <Card className="border-sky-500/25 bg-sky-500/[0.03]">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-sky-400" /> Wallet price alerts
          <Badge variant="outline" className="border-sky-500/30 text-[10px] uppercase text-sky-300">
            Live prices
          </Badge>
          <Badge
            variant="outline"
            className="border-amber-500/40 text-[10px] uppercase text-amber-300"
          >
            Notify only · no trading
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-200/90">
          <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Alerts watch live market data for your holdings and notify you only. They never place,
            sign or route an order — execution stays disabled and paper trading remains the only
            simulated fill path.
          </p>
        </div>


        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Delivery channels
            </p>
            <Button size="sm" variant="outline" onClick={onTest} disabled={testing}>
              <Send className="mr-1 h-3.5 w-3.5" /> {testing ? "Sending…" : "Send test alert"}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["in_app", "push", "email"] as (keyof AlertChannelPrefs)[]).map((key) => {
              const Icon = key === "email" ? Mail : key === "push" ? Smartphone : MessageSquare;
              return (
                <div
                  key={key}
                  className="flex items-start justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon className="h-3.5 w-3.5 text-sky-400" /> {CHANNEL_LABELS[key]}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {CHANNEL_HINTS[key]}
                    </p>
                  </div>
                  <Switch
                    checked={channels[key]}
                    onCheckedChange={(v) => void onToggleChannel(key, v)}
                    aria-label={`Toggle ${CHANNEL_LABELS[key]} for price alerts`}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Every attempt is saved to the delivery log below, including skips — so you always know
            where an alert went.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Asset</Label>
            <Select value={activeSymbol} onValueChange={setSymbol}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {symbols.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Condition</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as WalletAlertKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ALERT_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {isPriceKind(kind) ? "Price (USD)" : isMoveKind(kind) ? "Move (%)" : "Change (%)"}
            </Label>
            <Input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={isPriceKind(kind) ? String(live?.price?.toFixed(2) ?? "0") : "5"}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cooldown (min)</Label>
            <Input
              inputMode="numeric"
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
            />
          </div>
        </div>

        {isMoveKind(kind) && (
          <p className="text-xs text-muted-foreground">
            Measured against a rolling baseline captured at the last check. A drop rule tracks the
            recent peak, a rise rule tracks the recent trough, and the baseline resets each time the
            alert fires. Informational only — no trades are placed.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" /> Add alert
          </Button>
          {live && (
            <span className="text-xs text-muted-foreground">
              {activeSymbol} now ${live.price.toLocaleString(undefined, { maximumFractionDigits: 6 })} ·
              24h {live.change24h > 0 ? "+" : ""}
              {live.change24h.toFixed(2)}%
            </span>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rules ({rules.length})
          </p>
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No alerts yet — add a threshold above to be notified when your holdings move.
            </p>
          )}
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {describeRule(r)}
                  {isRuleMuted(r) && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      Muted until {new Date(r.mutedUntil!).toLocaleTimeString()}
                    </Badge>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Cooldown {formatCooldown(r.cooldownMinutes)} ·{" "}
                  {r.lastFiredAt
                    ? `last fired ${new Date(r.lastFiredAt).toLocaleString()}`
                    : "never fired"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={String(r.cooldownMinutes)}
                  onValueChange={(v) => updateRule(r.id, { cooldownMinutes: Number(v) })}
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Cooldown">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COOLDOWN_PRESETS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        Cooldown {formatCooldown(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isRuleMuted(r) ? (
                  <Button variant="outline" size="sm" onClick={() => unmuteRule(r.id)}>
                    Unmute
                  </Button>
                ) : (
                  <Select value="" onValueChange={(v) => muteRule(r.id, Number(v))}>
                    <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Mute alert">
                      <span className="flex items-center gap-1">
                        <BellOff className="h-3 w-3" /> Mute
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {MUTE_PRESETS.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          Mute {h}h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(v) => updateRule(r.id, { enabled: v })}
                  aria-label={`Toggle alert ${describeRule(r)}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete alert"
                  onClick={() => removeRule(r.id)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Triggered ({events.length})
            </p>
            {events.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearEvents}>
                Clear
              </Button>
            )}
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts have fired yet.</p>
          ) : (
            <div className="space-y-1">
              {events.slice(0, 8).map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-1.5 text-xs"
                >
                  <span>{e.message}</span>
                  <span className="text-muted-foreground">
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Delivery log ({deliveries.length})
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={deliveries.length === 0}
              onClick={() => {
                downloadCsv(notifyLogFilename(), deliveriesToCsv(deliveries));
                toast.success(`Exported ${deliveries.length} delivery entries as CSV`);
              }}
            >
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
          </div>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deliveries recorded yet — send a test alert to verify your channels.
            </p>
          ) : (
            <div className="space-y-1">
              {deliveries.slice(0, 10).map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-1.5 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase"
                    >
                      {d.channel === "in_app" ? "in-app" : d.channel}
                    </Badge>
                    <span className="text-muted-foreground">{d.title}</span>
                  </span>
                  <span
                    className={
                      d.status === "sent"
                        ? "text-emerald-400"
                        : d.status === "failed"
                          ? "text-rose-400"
                          : "text-muted-foreground"
                    }
                  >
                    {d.status}
                    {d.reason ? ` · ${reasonLabel(d.reason)}` : ""} ·{" "}
                    {new Date(d.ts).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function activeSymbolForTest(symbols: string[], symbol: string) {
  return symbols.includes(symbol) ? symbol : (symbols[0] ?? "BTC");
}
