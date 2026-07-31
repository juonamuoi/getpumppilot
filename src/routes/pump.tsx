import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import {
  PUMP_ALLOCATION,
  PUMP_DAILY_SEND_LIMIT,
  PUMP_SIGNUP_BONUS,
  PUMP_TOKEN,
  claimPumpQuest,
  fetchPumpSummary,
  formatPump,
  pumpErrorMessage,
  sendPump,
  type PumpSummary,
} from "@/lib/pump";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  Coins,
  Copy,
  Gift,
  Loader2,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PumpPayoutSettings } from "@/components/pump-payout-settings";

const BASE = "https://www.getpumppilot.app";

export const Route = createFileRoute("/pump")({
  head: () => ({
    meta: withSocialMeta(
      [
        { title: "PUMP token — rewards, quests & transfers | PumpPilot AI" },
        {
          name: "description",
          content:
            "Earn PUMP for signing up and completing quests, send it to other members, and track the on-chain token plan. PUMP is a reward token, not an investment.",
        },
        { property: "og:title", content: "PUMP token — rewards, quests & transfers" },
        {
          property: "og:description",
          content: "500 PUMP signup bonus, activity quests and peer transfers inside PumpPilot AI.",
        },
        { property: "og:type", content: "website" },
      ],
      { url: `${BASE}/pump` },
    ),
    links: [{ rel: "canonical", href: `${BASE}/pump` }],
  }),
  component: PumpPage,
});

function PumpPage() {
  const { user, loading } = useAuth();
  const [summary, setSummary] = useState<PumpSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toTag, setToTag] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const refresh = useCallback(async () => {
    try {
      const s = await fetchPumpSummary();
      setSummary(s);
    } catch {
      /* signed out or offline */
    }
  }, []);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  async function onClaim(key: string) {
    setBusy(key);
    try {
      const res = await claimPumpQuest(key);
      if (!res.ok) toast.error(pumpErrorMessage(res.reason));
      else toast.success(`Claimed ${formatPump(res.awarded ?? 0)}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(null);
    }
  }

  async function onSend() {
    const amt = Number(amount);
    if (!toTag.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a PUMP tag and a whole amount.");
      return;
    }
    setBusy("send");
    try {
      const res = await sendPump(toTag.trim(), amt, memo.trim() || undefined);
      if (!res.ok) toast.error(pumpErrorMessage(res.reason));
      else {
        toast.success(`Sent ${formatPump(res.sent ?? 0)} to ${toTag.trim()}`);
        setToTag("");
        setAmount("");
        setMemo("");
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(null);
    }
  }

  function copyTag() {
    if (!summary?.tag) return;
    void navigator.clipboard.writeText(summary.tag);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const claimable = (summary?.quests ?? []).filter((q) => !q.claimed);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">PUMP token</h1>
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
            Reward token
          </Badge>
          <Badge variant="outline" className="border-amber-500/40 text-amber-400">
            Not an investment
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          PUMP is the PumpPilot reward token. Earn it for signing up and completing quests, and send
          it to other members. Balances live in your PumpPilot account ledger today and can be
          settled on-chain once the token contract is deployed.
        </p>
      </header>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm text-amber-200/90">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            PUMP has no guaranteed value, no promised price and no entitlement to profit. It is a
            loyalty reward, not a security or an investment product. Nothing on this page is
            financial advice. PumpPilot never asks for your seed phrase.
          </p>
        </CardContent>
      </Card>

      {!user && !loading ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4 text-emerald-400" /> {PUMP_SIGNUP_BONUS} PUMP signup bonus
            </CardTitle>
            <CardDescription>
              Create a free account and {PUMP_SIGNUP_BONUS} PUMP lands in your balance instantly.
              Then work through the quests to earn more.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/auth">Create free account</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {user ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Your balance</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Coins className="h-5 w-5 text-emerald-400" />
                  {(summary?.balance ?? 0).toLocaleString()}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Lifetime earned {(summary?.lifetime_earned ?? 0).toLocaleString()} · sent{" "}
                {(summary?.lifetime_sent ?? 0).toLocaleString()} · received{" "}
                {(summary?.lifetime_received ?? 0).toLocaleString()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Your PUMP tag</CardDescription>
                <CardTitle className="font-mono text-2xl">{summary?.tag ?? "…"}</CardTitle>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="secondary" onClick={copyTag}>
                  {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                  Copy tag
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Share this so other members can send you PUMP.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unclaimed quests</CardDescription>
                <CardTitle className="text-2xl">{claimable.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Worth {claimable.reduce((a, q) => a + q.reward, 0).toLocaleString()} PUMP in total.
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-emerald-400" /> Earn PUMP
              </CardTitle>
              <CardDescription>
                Complete the action in the app, then claim the reward here. Each quest pays once.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(summary?.quests ?? []).map((q) => (
                <div
                  key={q.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{q.title}</p>
                    <p className="text-xs text-muted-foreground">{q.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-emerald-400">
                      +{q.reward.toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant={q.claimed ? "outline" : "default"}
                      disabled={q.claimed || busy === q.key}
                      onClick={() => onClaim(q.key)}
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
              ))}
              {!summary ? <p className="text-sm text-muted-foreground">Loading quests…</p> : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Send className="h-4 w-4 text-emerald-400" /> Send PUMP to a member
                </CardTitle>
                <CardDescription>
                  Instant, fee-free transfers inside PumpPilot. Daily limit{" "}
                  {PUMP_DAILY_SEND_LIMIT.toLocaleString()} PUMP.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Recipient PUMP tag (e.g. 4f2a9c1b)"
                  value={toTag}
                  onChange={(e) => setToTag(e.target.value)}
                />
                <Input
                  type="number"
                  min={1}
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Input
                  placeholder="Memo (optional)"
                  maxLength={200}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
                <Button onClick={onSend} disabled={busy === "send"} className="w-full">
                  {busy === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send PUMP
                </Button>
              </CardContent>
            </Card>

            <PumpPayoutSettings
              address={summary?.payout_address ?? null}
              updatedAt={summary?.payout_address_updated_at ?? null}
              onSaved={refresh}
            />
          </div>

          <PumpRedemptions onRedeemed={refresh} />

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Activity</CardTitle>
                <CardDescription>Your last 50 PUMP movements.</CardDescription>
              </div>
              <Button asChild size="sm" variant="secondary">
                <Link to="/pump-history">Transfer history & receipts</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {(summary?.ledger ?? []).map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-muted/20"
                >
                  <div className="min-w-0">
                    <span className="font-medium capitalize">{l.kind.replace(/_/g, " ")}</span>
                    {l.memo ? (
                      <span className="ml-2 text-xs text-muted-foreground">{l.memo}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <span className={l.delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {l.delta >= 0 ? "+" : ""}
                      {l.delta.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
              {summary && summary.ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">No PUMP activity yet.</p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token design</CardTitle>
          <CardDescription>
            {PUMP_TOKEN.name} ({PUMP_TOKEN.symbol}) · {PUMP_TOKEN.decimals} decimals · hard cap{" "}
            {PUMP_TOKEN.maxSupply.toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2">
            {PUMP_ALLOCATION.map((a) => (
              <div key={a.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{a.label}</span>
                  <span className="text-muted-foreground">{a.pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-emerald-500/70" style={{ width: `${a.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <Separator />
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Contract status:{" "}
              {PUMP_TOKEN.contractAddress ? (
                <span className="font-mono">{PUMP_TOKEN.contractAddress}</span>
              ) : (
                <span className="text-amber-400">not deployed yet</span>
              )}
              . The audited-ready ERC-20 source lives at{" "}
              <code className="font-mono">{PUMP_TOKEN.contractPath}</code> and is capped, burnable
              and mints only through a one-time-per-claim settlement function.
            </p>
            <p>
              Deploy it from a wallet you control, get it audited, and take legal advice before any
              public distribution or liquidity. PumpPilot never holds your keys.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
