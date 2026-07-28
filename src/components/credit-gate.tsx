import { Link } from "@tanstack/react-router";
import { Lock, Zap, BatteryLow } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { useCredits } from "@/hooks/useCredits";
import { CREDIT_COSTS, CREDIT_LABELS, type CreditFeature } from "@/lib/credits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";

interface Props {
  feature: CreditFeature;
  featureName: string;
  children: React.ReactNode;
}

/**
 * Blocks a credit-powered surface when the account has run out of credits.
 * Prediction and execution both stop at zero — recharge to resume.
 */
export function CreditGate({ feature, featureName, children }: Props) {
  const { user } = useAuth();
  const { balance, loading } = useCredits();
  const cost = CREDIT_COSTS[feature];

  if (loading) return <AppShell><div className="p-8 text-sm text-muted-foreground">Loading…</div></AppShell>;

  if (!user) {
    return (
      <AppShell>
        <div className="p-6 md:p-10">
          <Card className="mx-auto max-w-lg space-y-4 p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-primary" />
            <h2 className="text-xl font-semibold">Sign in to use {featureName}</h2>
            <p className="text-sm text-muted-foreground">
              New accounts start with free credits — no subscription, no card required.
            </p>
            <Button asChild><Link to="/auth">Sign in</Link></Button>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (balance <= 0) {
    return (
      <AppShell>
        <div className="p-6 md:p-10">
          <Card className="mx-auto max-w-lg space-y-4 border-amber-500/40 p-8 text-center">
            <BatteryLow className="mx-auto h-10 w-10 text-amber-400" />
            <h2 className="text-xl font-semibold">Out of credits — the bot has stopped</h2>
            <p className="text-sm text-muted-foreground">
              {featureName} costs <span className="text-foreground font-medium">{cost} credit{cost === 1 ? "" : "s"}</span> per run
              ({CREDIT_LABELS[feature]}). Predictions and bot execution are paused until you recharge.
            </p>
            <Button asChild size="lg">
              <Link to="/pricing"><Zap className="mr-2 h-4 w-4" /> Recharge credits</Link>
            </Button>
            <p className="text-xs text-muted-foreground">Credits never expire. Pay only for what you run.</p>
          </Card>
        </div>
      </AppShell>
    );
  }

  return <>{children}</>;
}
