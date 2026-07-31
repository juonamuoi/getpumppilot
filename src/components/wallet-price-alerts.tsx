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
import { BellRing, Plus, Trash2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { useLivePriceMap, useLivePrices } from "@/lib/market-data";
import { useInjectedAccount, useWalletBalances } from "@/lib/wallet-balances";
import {
  ALERT_KIND_LABELS,
  addRule,
  clearEvents,
  describeRule,
  isPriceKind,
  removeRule,
  updateRule,
  useWalletAlertEvents,
  useWalletAlertRules,
  useWalletAlertWatcher,
  type WalletAlertKind,
} from "@/lib/wallet-alerts";

const KINDS: WalletAlertKind[] = ["price_above", "price_below", "change_up", "change_down"];

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
            <Label className="text-xs">{isPriceKind(kind) ? "Price (USD)" : "Change (%)"}</Label>
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
                <p className="truncate text-sm font-medium">{describeRule(r)}</p>
                <p className="text-[11px] text-muted-foreground">
                  Cooldown {r.cooldownMinutes}m ·{" "}
                  {r.lastFiredAt
                    ? `last fired ${new Date(r.lastFiredAt).toLocaleString()}`
                    : "never fired"}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
      </CardContent>
    </Card>
  );
}
