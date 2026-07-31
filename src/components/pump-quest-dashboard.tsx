import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, Gift, Loader2, Lock, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  claimPumpQuest,
  fetchPumpReferralStatus,
  fetchPumpSummary,
  formatPump,
  pumpErrorMessage,
  type PumpQuest,
  type PumpSummary,
} from "@/lib/pump";
import { QUEST_CTA, QUEST_UNLOCK, useQuestActions } from "@/lib/quest-progress";
import { usePaper } from "@/lib/paper-store";
import { useWalletAlertRules } from "@/lib/wallet-alerts";
import { useWalletSession } from "@/lib/wallet-session";

type Status = "claimed" | "ready" | "pending";

function relative(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export function PumpQuestDashboard({ onChanged }: { onChanged?: () => void }) {
  const [summary, setSummary] = useState<PumpSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [referred, setReferred] = useState(0);

  const actions = useQuestActions();
  const session = useWalletSession();
  const rules = useWalletAlertRules();
  const { trades } = usePaper();

  const tourDone =
    typeof window !== "undefined" &&
    window.localStorage.getItem("pumppilot.tour.paper-risk.v1") === "done";

  async function load() {
    try {
      const s = await fetchPumpSummary();
      setSummary(s.ok ? s : null);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
    try {
      const r = await fetchPumpReferralStatus();
      setReferred(r.ok ? (r.invited ?? 0) : 0);
    } catch {
      /* referral status is optional */
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = useMemo<Record<string, boolean>>(
    () => ({
      connect_wallet: Boolean(session.address) || Boolean(actions.connect_wallet),
      first_scan: Boolean(actions.first_scan),
      security_scan: Boolean(session.scan) || Boolean(actions.security_scan),
      create_alert: rules.length > 0 || Boolean(actions.create_alert),
      paper_trade: trades.length > 0 || Boolean(actions.paper_trade),
      complete_tour: tourDone || Boolean(actions.complete_tour),
      refer_friend: referred > 0 || Boolean(actions.refer_friend),
    }),
    [actions, session.address, session.scan, rules.length, trades.length, tourDone, referred],
  );

  const quests = summary?.quests ?? [];
  const statusOf = (q: PumpQuest): Status =>
    q.claimed ? "claimed" : done[q.key] ? "ready" : "pending";

  const claimed = quests.filter((q) => q.claimed);
  const ready = quests.filter((q) => statusOf(q) === "ready");
  const pending = quests.filter((q) => statusOf(q) === "pending");
  const totalReward = quests.reduce((a, q) => a + q.reward, 0);
  const earned = claimed.reduce((a, q) => a + q.reward, 0);
  const pct = totalReward ? Math.round((earned / totalReward) * 100) : 0;

  async function claim(key: string) {
    setBusy(key);
    try {
      const res = await claimPumpQuest(key);
      if (!res.ok) toast.error(pumpErrorMessage(res.reason));
      else toast.success(`Claimed ${formatPump(res.awarded ?? 0)}`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Quests completed</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Trophy className="h-5 w-5 text-emerald-400" />
              {claimed.length}/{quests.length || "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={pct} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {earned.toLocaleString()} of {totalReward.toLocaleString()} quest PUMP earned ({pct}%).
            </p>
          </CardContent>
        </Card>

        <Card className={ready.length ? "border-emerald-500/40 bg-emerald-500/5" : undefined}>
          <CardHeader className="pb-2">
            <CardDescription>Ready to claim</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Gift className="h-5 w-5 text-emerald-400" />
              {ready.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Worth {ready.reduce((a, q) => a + q.reward, 0).toLocaleString()} PUMP right now.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Still pending</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Clock className="h-5 w-5 text-amber-400" />
              {pending.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Locked until the in-app action is done — {pending.reduce((a, q) => a + q.reward, 0).toLocaleString()} PUMP
            left on the table.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-400" /> Quest dashboard
          </CardTitle>
          <CardDescription>
            Each quest pays once. Rewards unlock as soon as the matching action is detected in your
            account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading quests…</p>
          ) : quests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sign in to see your quests and PUMP rewards.
            </p>
          ) : null}

          {quests.map((q) => {
            const status = statusOf(q);
            const cta = QUEST_CTA[q.key];
            return (
              <div
                key={q.key}
                className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 ${
                  status === "ready"
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border/60 bg-card/40"
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{q.title}</p>
                    {status === "claimed" ? (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Unlocked
                      </Badge>
                    ) : status === "ready" ? (
                      <Badge className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">
                        Claimable now
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                        <Lock className="mr-1 h-3 w-3" /> Pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{q.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {status === "claimed"
                      ? `Claimed ${relative(q.claimed_at) ?? "earlier"}${
                          q.claimed_at ? ` · ${new Date(q.claimed_at).toLocaleString()}` : ""
                        }`
                      : status === "ready"
                        ? "Requirement met — claim it any time."
                        : (QUEST_UNLOCK[q.key] ?? "Complete the action in the app to unlock.")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-emerald-400">
                    +{q.reward.toLocaleString()}
                  </span>
                  {status === "pending" && cta ? (
                    <Button size="sm" variant="secondary" asChild>
                      <Link to={cta.to}>{cta.label}</Link>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant={status === "ready" ? "default" : "outline"}
                    disabled={q.claimed || busy === q.key}
                    onClick={() => void claim(q.key)}
                  >
                    {busy === q.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : q.claimed ? (
                      "Claimed"
                    ) : (
                      "Claim"
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
