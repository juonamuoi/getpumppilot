import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import { useSubscription, type Tier } from "@/hooks/useSubscription";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";

interface Props {
  required: Tier; // "pro" | "quant"
  featureName: string;
  children: React.ReactNode;
}

const RANK: Record<Tier, number> = { free: 0, pro: 1, quant: 2 };

export function PaywallGate({ required, featureName, children }: Props) {
  const { user } = useAuth();
  const { tier, loading } = useSubscription();

  if (loading) return <AppShell><div className="p-8 text-sm text-muted-foreground">Loading…</div></AppShell>;

  if (!user) {
    return (
      <AppShell>
        <div className="p-6 md:p-10">
          <Card className="p-8 max-w-lg mx-auto text-center space-y-4">
            <Lock className="w-10 h-10 mx-auto text-primary" />
            <h2 className="text-xl font-semibold">Sign in to unlock {featureName}</h2>
            <p className="text-sm text-muted-foreground">Create a free account, then upgrade to Pro to use this tool.</p>
            <Button asChild><Link to="/auth">Sign in</Link></Button>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (RANK[tier] >= RANK[required]) return <>{children}</>;

  return (
    <AppShell>
      <div className="p-6 md:p-10">
        <Card className="p-8 max-w-lg mx-auto text-center space-y-4 border-primary/40">
          <Sparkles className="w-10 h-10 mx-auto text-primary" />
          <h2 className="text-xl font-semibold">{featureName} is a {required === "quant" ? "Quant" : "Pro"} feature</h2>
          <p className="text-sm text-muted-foreground">
            Upgrade to unlock this tool along with the rest of the {required === "quant" ? "Quant" : "Pro"} suite.
          </p>
          <Button asChild size="lg"><Link to="/pricing">See plans</Link></Button>
          <p className="text-xs text-muted-foreground">Cancel anytime — you keep access until the end of your billing period.</p>
        </Card>
      </div>
    </AppShell>
  );
}
