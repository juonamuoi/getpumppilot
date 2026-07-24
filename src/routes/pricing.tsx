import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Sparkles, ArrowLeft, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentTestModeBanner } from "@/components/payment-test-mode-banner";
import { StripeEmbeddedCheckout } from "@/components/stripe-embedded-checkout";
import { useAuth } from "@/lib/auth-store";
import { useSubscription } from "@/hooks/useSubscription";
import { createPortalSession } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";

type SearchParams = { checkout?: string; session_id?: string; plan?: string };

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — PumpPilot AI" },
      { name: "description", content: "Choose the plan that fits your trading. Free forever paper trading, Pro unlocks the AI toolkit, Quant adds live data and API access." },
      { property: "og:title", content: "PumpPilot AI Pricing" },
      { property: "og:description", content: "Free, Pro, and Quant plans for smarter momentum trading." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    checkout: typeof s.checkout === "string" ? s.checkout : undefined,
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
    plan: typeof s.plan === "string" ? s.plan : undefined,
  }),
  component: PricingPage,
});

type PlanKey = "pumppilot_pro_monthly" | "pumppilot_pro_yearly" | "pumppilot_quant_monthly" | "pumppilot_quant_yearly";

const TIERS = [
  {
    name: "Free",
    tag: "For learning",
    priceMonthly: "$0",
    priceYearly: "$0",
    priceIdMonthly: null,
    priceIdYearly: null,
    features: [
      "Dashboard & scanner",
      "3 alert rules",
      "Paper trading",
      "Community & leaderboards",
      "Security Center",
    ],
    cta: "Current plan",
    highlight: false,
  },
  {
    name: "Pro",
    tag: "Most popular",
    priceMonthly: "$19",
    priceYearly: "$190",
    priceIdMonthly: "pumppilot_pro_monthly" as PlanKey,
    priceIdYearly: "pumppilot_pro_yearly" as PlanKey,
    features: [
      "Everything in Free",
      "AI Copilot (Gemini 2.5)",
      "Portfolio Doctor",
      "Trade Journal & analytics",
      "Unlimited alerts",
      "Full backtesting engine",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    name: "Quant",
    tag: "Advanced",
    priceMonthly: "$99",
    priceYearly: "$990",
    priceIdMonthly: "pumppilot_quant_monthly" as PlanKey,
    priceIdYearly: "pumppilot_quant_yearly" as PlanKey,
    features: [
      "Everything in Pro",
      "Live market data feeds",
      "Priority scanner",
      "Strategy marketplace revenue share",
      "API access to momentum scores",
      "Early access to new signals",
    ],
    cta: "Go Quant",
    highlight: false,
  },
];

function PricingPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/pricing" });
  const { user } = useAuth();
  const { tier, subscription, isActive, refetch } = useSubscription();
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [checkoutPrice, setCheckoutPrice] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (search.checkout === "success") {
      toast.success("Welcome aboard — your plan is activating.");
      // subscription webhook can take a couple seconds; poll a few times
      let tries = 0;
      const iv = window.setInterval(() => {
        refetch();
        tries++;
        if (tries >= 6) window.clearInterval(iv);
      }, 1500);
      // strip params
      navigate({ to: "/pricing", search: {}, replace: true });
      return () => window.clearInterval(iv);
    }
  }, [search.checkout, navigate, refetch]);

  const startCheckout = (priceId: string | null) => {
    if (!priceId) return;
    if (!user) {
      toast.info("Sign in to subscribe.");
      navigate({ to: "/auth" });
      return;
    }
    setCheckoutPrice(priceId);
  };

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const result = await createPortalSession({
        data: { returnUrl: `${window.location.origin}/pricing`, environment: getStripeEnvironment() },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const currentPriceId = subscription?.price_id;

  if (checkoutPrice) {
    return (
      <AppShell>
        <PaymentTestModeBanner />
        <div className="mx-auto max-w-3xl py-6">
          <Button variant="ghost" size="sm" onClick={() => setCheckoutPrice(null)} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to plans
          </Button>
          <Card className="p-2 md:p-4">
            <StripeEmbeddedCheckout priceId={checkoutPrice} />
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-6xl py-6 space-y-8">
        <div className="text-center space-y-3">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
            <Sparkles className="mr-1 h-3 w-3" /> Simple pricing
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Trade smarter, on your terms</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Start free with paper trading. Upgrade any time — you keep access until the end of your billing period if you cancel.
          </p>
          {isActive && (
            <div className="pt-2">
              <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 border">
                You're on {tier.toUpperCase()} ({subscription?.cancel_at_period_end ? "canceling at period end" : subscription?.status})
              </Badge>
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={openPortal} disabled={portalLoading}>
                  {portalLoading ? "Opening…" : "Manage billing"} <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
          <div className="inline-flex rounded-full border border-border/60 bg-muted/20 p-1 text-xs">
            <button
              onClick={() => setInterval("monthly")}
              className={`rounded-full px-4 py-1.5 transition ${interval === "monthly" ? "bg-emerald-500/20 text-emerald-200" : "text-muted-foreground"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("yearly")}
              className={`rounded-full px-4 py-1.5 transition ${interval === "yearly" ? "bg-emerald-500/20 text-emerald-200" : "text-muted-foreground"}`}
            >
              Yearly <span className="ml-1 text-emerald-400">save 17%</span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((t) => {
            const priceId = interval === "monthly" ? t.priceIdMonthly : t.priceIdYearly;
            const price = interval === "monthly" ? t.priceMonthly : t.priceYearly;
            const isCurrent = priceId ? currentPriceId === priceId : (tier === "free" && !isActive);
            return (
              <Card
                key={t.name}
                className={`p-6 flex flex-col ${t.highlight ? "border-emerald-500/50 ring-1 ring-emerald-500/30" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{t.name}</h3>
                  {t.highlight && <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 border">{t.tag}</Badge>}
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{price}</span>
                  <span className="text-muted-foreground text-sm">/{interval === "monthly" ? "mo" : "yr"}</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" /> <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>Current plan</Button>
                  ) : priceId ? (
                    <Button className="w-full" variant={t.highlight ? "default" : "outline"} onClick={() => startCheckout(priceId)}>
                      {t.cta}
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full" disabled>Free forever</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-5 text-xs text-muted-foreground space-y-2 max-w-3xl mx-auto">
          <p><strong className="text-foreground">Cancel anytime.</strong> If you cancel, you keep full access until the end of the current billing period. No refunds for partial periods.</p>
          <p><strong className="text-foreground">Upgrades</strong> apply immediately and are prorated. <strong className="text-foreground">Downgrades</strong> take effect at the next renewal.</p>
          <p>PumpPilot AI is an educational trading sandbox. Live execution is locked. Predictions are probabilistic — you can lose all capital. Nothing here is financial advice.</p>
          <p className="pt-1">
            Admin: run a <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate({ to: "/go-live-test" })}>guided go-live payment test</Button> to verify checkout and statement descriptor.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
