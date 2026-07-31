import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coins, Loader2, Rocket, Timer } from "lucide-react";
import { fetchPumpReferralStatus, formatPump, type PumpReferralStatus } from "@/lib/pump";

/**
 * PUMP referral rewards: both sides are paid once the invited member signs up
 * AND completes the required first action (connecting a wallet). Pending
 * invites are shown so the referrer can see what is still unclaimed.
 */
export function PumpReferralRewards() {
  const [status, setStatus] = useState<PumpReferralStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPumpReferralStatus()
      .then((s) => alive && setStatus(s.ok ? s : null))
      .catch(() => alive && setStatus(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" /> PUMP referral bonus
            </CardTitle>
            <CardDescription>
              Your friend signs up and completes their first required action —{" "}
              <span className="text-foreground">{status?.activation_title ?? "Connect a wallet"}</span> — then you both get PUMP.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/pump">Open PUMP wallet</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading referral rewards…
          </div>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">Sign in to see your PUMP referral rewards.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="PUMP earned" value={formatPump(status.pump_earned)} />
              <Stat label="Activated invites" value={String(status.activated)} />
              <Stat label="Awaiting first action" value={String(status.pending)} />
              <Stat label="Per activation" value={`+${status.referrer_award.toLocaleString()} / +${status.referred_award.toLocaleString()}`} />
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
              <div className="flex items-start gap-3">
                <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="space-y-1 text-muted-foreground">
                  <p>
                    <span className="text-foreground font-medium">You get {formatPump(status.referrer_award)}</span> and your friend gets{" "}
                    <span className="text-foreground font-medium">{formatPump(status.referred_award)}</span> the moment they complete the required
                    action. Signup alone does not pay out, so bot accounts earn nothing.
                  </p>
                  {status.i_was_referred && (
                    <p>
                      Your own welcome bonus:{" "}
                      {status.my_bonus_awarded ? (
                        <span className="text-foreground">credited ✓</span>
                      ) : (
                        <>
                          pending — claim the “{status.activation_title ?? "Connect a wallet"}” quest on the{" "}
                          <Link to="/pump" className="text-primary underline-offset-2 hover:underline">
                            PUMP page
                          </Link>{" "}
                          to unlock it.
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {status.referrals.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Invite activity</div>
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {status.referrals.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Timer className="h-4 w-4" />
                        <span>Joined {new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      {r.status === "awarded" ? (
                        <Badge variant="secondary" className="font-mono">+{r.pump.toLocaleString()} PUMP</Badge>
                      ) : (
                        <Badge variant="outline">Awaiting first action</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
