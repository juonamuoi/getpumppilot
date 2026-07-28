import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Sparkles, ArrowLeft, Zap, History } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentTestModeBanner } from "@/components/payment-test-mode-banner";
import { StripeEmbeddedCheckout } from "@/components/stripe-embedded-checkout";
import { useAuth } from "@/lib/auth-store";
import { useCredits } from "@/hooks/useCredits";
import { CREDIT_COSTS, CREDIT_LABELS, CREDIT_PACKS, costPerDollar, packByPriceId } from "@/lib/credits";
import { toast } from "sonner";

type SearchParams = { checkout?: string; session_id?: string; plan?: string };

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Credits & Pricing — PumpPilot AI" },
      {
        name: "description",
        content:
          "No subscription. Recharge PumpPilot AI with credits and pay only for the predictions, backtests and bot executions you run. Credits never expire.",
      },
      { property: "og:title", content: "PumpPilot AI Credits — pay as you trade" },
      { property: "og:description", content: "Top up credits, run AI momentum predictions, stop paying when you stop trading." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/pricing` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/pricing` }],
    scripts: [
      ldScript({
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": `${SITE_URL}/pricing#credits`,
        name: "PumpPilot AI Credits",
        description:
          "Pay-as-you-go credits for PumpPilot AI. Spend credits on momentum predictions, Copilot answers, backtests, Portfolio Doctor audits and paper-bot orders. Credits never expire.",
        category: "Prepaid software credits",
        brand: { "@id": ORG_ID },
        image: LOGO_URL,
        url: `${SITE_URL}/pricing`,
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "USD",
          offerCount: CREDIT_PACKS.length,
          lowPrice: (Math.min(...CREDIT_PACKS.map((p) => p.amountCents)) / 100).toFixed(2),
          highPrice: (Math.max(...CREDIT_PACKS.map((p) => p.amountCents)) / 100).toFixed(2),
          offers: CREDIT_PACKS.map((pack) => ({
            "@type": "Offer",
            name: `${pack.name} — ${pack.credits.toLocaleString()} credits`,
            sku: pack.priceId,
            price: (pack.amountCents / 100).toFixed(2),
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/pricing`,
          })),
        },
      }),
      ldScript(breadcrumbSchema([{ name: "Credits & Pricing", path: "/pricing" }])),
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    checkout: typeof s.checkout === "string" ? s.checkout : undefined,
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
    plan: typeof s.plan === "string" ? s.plan : undefined,
  }),
  component: PricingPage,
});

const USAGE_ROWS = (Object.keys(CREDIT_COSTS) as (keyof typeof CREDIT_COSTS)[]).map((k) => ({
  label: CREDIT_LABELS[k],
  cost: CREDIT_COSTS[k],
}));

function PricingPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/pricing" });
  const { user } = useAuth();
  const { balance, row, ledger, refetch } = useCredits();
  const [checkoutPrice, setCheckoutPrice] = useState<string | null>(null);

  useEffect(() => {
    if (search.checkout === "success") {
      toast.success("Payment received — credits are landing in your account.");
      let tries = 0;
      const iv = window.setInterval(() => {
        refetch();
        tries++;
        if (tries >= 8) window.clearInterval(iv);
      }, 1500);
      navigate({ to: "/pricing", search: {}, replace: true });
      return () => window.clearInterval(iv);
    }
  }, [search.checkout, navigate, refetch]);

  const startCheckout = (priceId: string) => {
    if (!user) {
      toast.info("Sign in to buy credits.");
      navigate({ to: "/auth" });
      return;
    }
    setCheckoutPrice(priceId);
  };

  if (checkoutPrice) {
    const pack = packByPriceId(checkoutPrice);
    return (
      <AppShell>
        <PaymentTestModeBanner />
        <div className="mx-auto max-w-3xl py-6">
          <Button variant="ghost" size="sm" onClick={() => setCheckoutPrice(null)} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to credit packs
          </Button>
          {pack && (
            <p className="mb-3 text-sm text-muted-foreground">
              Buying <span className="text-foreground font-medium">{pack.credits.toLocaleString()} credits</span> ({pack.name} pack).
              Pick a quantity in checkout to buy multiple packs at once.
            </p>
          )}
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
      <div className="mx-auto max-w-6xl space-y-8 py-6">
        <div className="space-y-3 text-center">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
            <Sparkles className="mr-1 h-3 w-3" /> No subscription — pay as you trade
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">PumpPilot AI Pricing — Credits for AI Crypto Trading</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Every AI prediction, backtest and bot execution burns credits. When your balance hits zero the bot stops
            predicting and stops executing — nothing is charged in the background. Credits never expire.
          </p>
          {user && (
            <div className="pt-2">
              <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                <Zap className="mr-1 h-3 w-3" /> Balance: {balance.toLocaleString()} credits
              </Badge>
              {row && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.lifetime_purchased.toLocaleString()} purchased · {row.lifetime_spent.toLocaleString()} spent
                </p>
              )}
              {balance <= 0 && (
                <p className="mt-2 text-xs text-red-300">Bot paused — top up below to resume predictions and execution.</p>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {CREDIT_PACKS.map((p) => (
            <Card
              key={p.priceId}
              className={`flex flex-col p-6 ${p.highlight ? "border-emerald-500/50 ring-1 ring-emerald-500/30" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{p.name}</h2>
                {p.tag && (
                  <Badge className="border border-emerald-500/30 bg-emerald-500/20 text-emerald-300">{p.tag}</Badge>
                )}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{p.priceLabel}</span>
                <span className="text-sm text-muted-foreground">one-time</span>
              </div>
              <p className="mt-2 text-sm text-emerald-300">{p.credits.toLocaleString()} credits</p>
              <p className="text-xs text-muted-foreground">≈ {costPerDollar(p)} credits per $1</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{Math.floor(p.credits / CREDIT_COSTS.momentum_prediction).toLocaleString()} momentum predictions</span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{Math.floor(p.credits / CREDIT_COSTS.backtest_run).toLocaleString()} backtests</span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{Math.floor(p.credits / CREDIT_COSTS.doctor_audit).toLocaleString()} Portfolio Doctor audits</span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>Credits never expire · no recurring charge</span>
                </li>
              </ul>
              <Button
                className="mt-6 w-full"
                variant={p.highlight ? "default" : "outline"}
                onClick={() => startCheckout(p.priceId)}
              >
                <Zap className="mr-2 h-4 w-4" /> Buy {p.credits.toLocaleString()} credits
              </Button>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="text-sm font-semibold">What each action costs</h3>
            <div className="mt-3 divide-y divide-border/50 text-sm">
              {USAGE_ROWS.map((r) => (
                <div key={r.label} className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium">{r.cost} credit{r.cost === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Free actions: dashboard, watchlists, alerts history, Security Center, learn hub.
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4" /> Recent credit activity
            </h3>
            {!user ? (
              <p className="mt-3 text-sm text-muted-foreground">Sign in to see your credit history.</p>
            ) : ledger.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No credit activity yet.</p>
            ) : (
              <div className="mt-3 max-h-72 divide-y divide-border/50 overflow-y-auto text-sm">
                {ledger.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate">{l.description ?? l.kind}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(l.created_at).toLocaleString()} · balance {l.balance_after.toLocaleString()}
                      </p>
                    </div>
                    <span className={l.delta >= 0 ? "text-emerald-300" : "text-muted-foreground"}>
                      {l.delta >= 0 ? "+" : ""}
                      {l.delta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="mx-auto max-w-3xl space-y-2 p-5 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">No subscription, no auto-renewal.</strong> Credits are a one-time purchase and
            never expire. Nothing is billed unless you buy another pack.
          </p>
          <p>
            <strong className="text-foreground">Out of credits?</strong> The bot immediately stops generating predictions and
            stops executing orders. Your data, alerts and history remain accessible.
          </p>
          <p>
            PumpPilot AI is an educational trading sandbox. Live execution is locked. Predictions are probabilistic — you can
            lose all capital. Nothing here is financial advice. Credit purchases are non-refundable once credits are spent.
          </p>
          <p className="pt-1">
            Admin: run a{" "}
            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate({ to: "/go-live-test" })}>
              guided go-live payment test
            </Button>{" "}
            to verify checkout and statement descriptor.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
