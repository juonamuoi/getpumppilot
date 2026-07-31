import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BellRing, Coins, Gauge, Loader2, LayoutDashboard, Sparkles, Ticket } from "lucide-react";
import { toast } from "sonner";
import {
  fetchPumpPerks,
  formatPump,
  isPerkActive,
  pumpErrorMessage,
  redeemPumpPerk,
  type PumpPerk,
  type PumpPerkState,
} from "@/lib/pump";

const PERK_ICON: Record<string, typeof BellRing> = {
  extended_alerts: BellRing,
  premium_dashboard: LayoutDashboard,
  priority_scans: Gauge,
  credit_pack_100: Coins,
};

function daysLeft(iso: string) {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return d <= 1 ? "less than a day left" : `${d} days left`;
}

function PerkRow({
  perk,
  balance,
  busy,
  onRedeem,
}: {
  perk: PumpPerk;
  balance: number;
  busy: string | null;
  onRedeem: (key: string) => void;
}) {
  const Icon = PERK_ICON[perk.key] ?? Sparkles;
  const active = isPerkActive(perk);
  const affordable = balance >= perk.cost;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/10 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{perk.title}</span>
            {active ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">
                Active · {daysLeft(perk.active_until!)}
              </Badge>
            ) : perk.duration_days ? (
              <Badge variant="outline">{perk.duration_days}-day unlock</Badge>
            ) : perk.credits ? (
              <Badge variant="outline">{perk.credits} credits</Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{perk.description}</p>
          {perk.times_redeemed > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Redeemed {perk.times_redeemed}×
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="font-mono text-sm">{formatPump(perk.cost)}</span>
        <Button
          size="sm"
          variant={active ? "secondary" : "default"}
          disabled={!affordable || busy === perk.key}
          onClick={() => onRedeem(perk.key)}
        >
          {busy === perk.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {active ? "Extend" : affordable ? "Redeem" : "Need more PUMP"}
        </Button>
      </div>
    </div>
  );
}

export function PumpRedemptions({ onRedeemed }: { onRedeemed?: () => void | Promise<void> }) {
  const [state, setState] = useState<PumpPerkState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await fetchPumpPerks());
    } catch {
      /* signed out or offline */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function redeem(key: string) {
    setBusy(key);
    try {
      const res = await redeemPumpPerk(key);
      if (!res.ok) {
        toast.error(pumpErrorMessage(res.reason));
      } else {
        toast.success(
          res.credits_granted
            ? `Redeemed ${res.title} — ${res.credits_granted} credits added`
            : `${res.title} unlocked`,
        );
      }
      await load();
      await onRedeemed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Redemption failed");
    } finally {
      setBusy(null);
    }
  }

  const perks = state?.perks ?? [];
  const features = perks.filter((p) => p.category !== "credits");
  const credits = perks.filter((p) => p.category === "credits");

  return (
    <Card data-testid="pump-redemptions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="h-4 w-4 text-emerald-400" /> Redeem PUMP for app perks
        </CardTitle>
        <CardDescription>
          Spend PUMP inside PumpPilot — extended alerts, premium dashboards, faster scans or app
          credits. PUMP is a promo reward, not an investment, and is never used for market trades.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Your balance</span>
          <span className="font-mono">{formatPump(state?.balance ?? 0)}</span>
        </div>

        {features.map((p) => (
          <PerkRow key={p.key} perk={p} balance={state?.balance ?? 0} busy={busy} onRedeem={redeem} />
        ))}

        {credits.length ? (
          <>
            <Separator />
            {credits.map((p) => (
              <PerkRow
                key={p.key}
                perk={p}
                balance={state?.balance ?? 0}
                busy={busy}
                onRedeem={redeem}
              />
            ))}
          </>
        ) : null}

        {state?.history?.length ? (
          <div className="pt-2">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Redemption history
            </p>
            <div className="space-y-1">
              {state.history.slice(0, 8).map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-muted/20"
                >
                  <span className="truncate">{h.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleDateString()} · −{h.cost.toLocaleString()} PUMP
                    {h.credits_granted ? ` · +${h.credits_granted} credits` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
