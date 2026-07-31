/* Paper / Live execution mode switch with explicit risk unlock. */
import { useState } from "react";
import { toast } from "sonner";
import { Lock, ShieldAlert, Unlock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LIVE_RISK_POINTS,
  MAX_SLIPPAGE_BPS,
  MAX_TRADE_USD_CEILING,
  SUPPORTED_CHAINS,
  panicToPaper,
  updateLiveTrading,
  useLiveTrading,
} from "@/lib/live-trading";

export function TradeModeSwitch() {
  const s = useLiveTrading();
  const [ack, setAck] = useState(s.acknowledged);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {s.mode === "live" ? (
            <Unlock className="h-4 w-4 text-destructive" />
          ) : (
            <Lock className="h-4 w-4 text-primary" />
          )}
          Execution mode
        </CardTitle>
        <Badge variant={s.mode === "live" ? "destructive" : "secondary"}>
          {s.mode === "live" ? "Live — real funds" : "Paper — simulated"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Paper fills are simulated against live prices. Live mode routes real swaps through a DEX
          aggregator that you sign in your own wallet — PumpPilot never takes custody and never asks
          for a seed phrase.
        </p>

        {s.mode !== "live" && (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="flex items-center gap-1 text-sm font-medium text-destructive">
              <ShieldAlert className="h-4 w-4" /> Before you unlock live trading
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {LIVE_RISK_POINTS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <label className="flex items-start gap-2 text-xs text-foreground">
              <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} />
              <span>
                I understand live trades move real money, are irreversible, and are my own decision.
              </span>
            </label>
            <Button
              variant="destructive"
              size="sm"
              disabled={!ack}
              onClick={() => {
                updateLiveTrading({ acknowledged: true, mode: "live" });
                toast.warning("Live execution enabled — every swap still needs your wallet signature.");
              }}
            >
              Enable live trading
            </Button>
          </div>
        )}

        {s.mode === "live" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Chain</Label>
                <Select
                  value={String(s.chainId)}
                  onValueChange={(v) => updateLiveTrading({ chainId: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CHAINS.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-usd">Max per trade (USD)</Label>
                <Input
                  id="max-usd"
                  inputMode="numeric"
                  value={s.maxTradeUsd}
                  onChange={(e) => updateLiveTrading({ maxTradeUsd: Number(e.target.value) })}
                />
                <p className="text-[11px] text-muted-foreground">Ceiling ${MAX_TRADE_USD_CEILING.toLocaleString()}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slippage">Max slippage (bps)</Label>
                <Input
                  id="slippage"
                  inputMode="numeric"
                  value={s.slippageBps}
                  onChange={(e) => updateLiveTrading({ slippageBps: Number(e.target.value) })}
                />
                <p className="text-[11px] text-muted-foreground">Ceiling {MAX_SLIPPAGE_BPS} bps (3%)</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                panicToPaper();
                toast.success("Back to paper trading — live execution disabled.");
              }}
            >
              <Lock className="mr-2 h-4 w-4" /> Switch back to paper
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
