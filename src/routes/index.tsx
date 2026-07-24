import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  FlaskConical,
  TrendingUp,
  ShieldCheck,
  Bot,
  LineChart,
  Radar,
  Lock,
  Sparkles,
  Zap,
  Users,
  BookOpen,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PumpPilot AI — Spot momentum. Control risk. Trade smarter." },
      {
        name: "description",
        content:
          "Premium crypto dashboard with explainable momentum scores, market scanner, paper trading, backtesting and strict risk controls. Demo data only — not financial advice.",
      },
      { property: "og:title", content: "PumpPilot AI" },
      {
        property: "og:description",
        content:
          "Spot momentum. Control risk. Trade smarter. Paper-trade crypto with explainable AI signals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: Radar,
    title: "Momentum Scanner",
    desc: "Explainable momentum scores for BTC, ETH, SOL, BNB and demo small-cap tokens.",
  },
  {
    icon: Bot,
    title: "AI Copilot",
    desc: "Ask questions in plain English and get risk-aware coaching powered by Gemini.",
  },
  {
    icon: LineChart,
    title: "Trade Journal",
    desc: "Track win rate, expectancy, profit factor and equity curve across every paper trade.",
  },
  {
    icon: FlaskConical,
    title: "Paper Trading",
    desc: "Practice with simulated portfolios and orders. Live execution is locked by default.",
  },
  {
    icon: Sparkles,
    title: "Strategy Builder",
    desc: "Build, backtest and share rule-based strategies with the community.",
  },
  {
    icon: ShieldCheck,
    title: "Security Center",
    desc: "Phishing detection, wallet origin checks and incident reporting keep you safer.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["Dashboard & scanner", "3 alert rules", "Paper trading", "Community & leaderboards", "Security Center"],
    cta: "Start free",
    href: "/auth",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/mo",
    features: [
      "Everything in Free",
      "AI Copilot (Gemini 2.5)",
      "Portfolio Doctor",
      "Trade Journal & analytics",
      "Unlimited alerts",
      "Full backtesting engine",
    ],
    cta: "Upgrade to Pro",
    href: "/pricing",
    highlight: true,
  },
  {
    name: "Quant",
    price: "$99",
    period: "/mo",
    features: [
      "Everything in Pro",
      "Live market data feeds",
      "Priority scanner",
      "Strategy marketplace revenue share",
      "API access to momentum scores",
      "Early access to new signals",
    ],
    cta: "Go Quant",
    href: "/pricing",
    highlight: false,
  },
];

function LandingPage() {
  const { user } = useAuth();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const launchHref = user ? "/dashboard" : "/auth";
  const launchLabel = user ? "Launch Dashboard" : "Get started free";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-black shadow-lg shadow-emerald-500/20">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">PumpPilot AI</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Paper mode</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/pricing">Pricing</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={launchHref}>{launchLabel}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-16 pb-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl text-center">
          <Badge variant="outline" className="mb-4 border-emerald-500/30 px-3 py-1 text-emerald-300">
            <Lock className="mr-1.5 h-3 w-3" /> Live execution locked — paper trading only
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            Spot momentum. <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Control risk. Trade smarter.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            PumpPilot AI is an educational crypto dashboard that explains momentum signals, simulates
            trades and helps you build disciplined strategies before risking real capital.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link to={launchHref}>
                {launchLabel} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/learn">See how it works</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No seed phrases stored. No live trades by default. Demo data included.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Built for learning, not gambling</h2>
            <p className="mt-2 text-muted-foreground">
              Every tool is designed to make risk visible and decisions explainable.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="border-border/60 bg-card/60">
                <CardContent className="p-5">
                  <f.icon className="h-8 w-8 text-emerald-400" />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-y border-border/60 bg-muted/20 px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Simple pricing</h2>
            <p className="mt-2 text-muted-foreground">Start free. Upgrade when you're ready to go deeper.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <Card
                key={p.name}
                className={`flex flex-col p-6 ${p.highlight ? "border-emerald-500/50 ring-1 ring-emerald-500/30" : "border-border/60 bg-card/60"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {p.highlight && <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 border">Most popular</Badge>}
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{p.price}</span>
                  <span className="text-muted-foreground text-sm">{p.period}</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm flex-1">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex gap-2">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-6 w-full" variant={p.highlight ? "default" : "outline"} asChild>
                  <Link to={p.href}>{p.cta}</Link>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Trust / disclaimers */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl space-y-6 text-sm text-muted-foreground">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <h3 className="flex items-center gap-2 font-semibold text-amber-300">
              <TrendingUp className="h-4 w-4" /> Important disclaimer
            </h3>
            <p className="mt-2">
              PumpPilot AI is an educational trading sandbox. All prices, signals and portfolio data
              shown in paper mode are simulated or clearly labelled as demo. Predictions are
              probabilistic, returns are not guaranteed, and you can lose all capital. Nothing on this
              site is financial advice. Live execution is disabled and locked by default.
            </p>
          </div>
          <p>
            <strong className="text-foreground">Security first.</strong> We never request or store seed
            phrases or private keys. Wallet connection is read-only and runs origin checks to detect
            phishing attempts.
          </p>
          <p>
            <strong className="text-foreground">Subscriptions.</strong> Cancel any time through the
            billing portal. If you cancel, you keep access until the end of your current billing period.
            Upgrades apply immediately and are prorated; downgrades apply at the next renewal.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-black">
                  <FlaskConical className="h-4 w-4" />
                </div>
                <span className="font-bold tracking-tight">PumpPilot AI</span>
              </div>
              <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                Educational crypto dashboard with explainable momentum, paper trading and AI coaching.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-3 text-sm">
              <div>
                <h4 className="font-semibold text-foreground">Product</h4>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li><Link to="/scanner" className="hover:text-foreground">Scanner</Link></li>
                  <li><Link to="/paper" className="hover:text-foreground">Paper Trading</Link></li>
                  <li><Link to="/strategy" className="hover:text-foreground">Strategies</Link></li>
                  <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Resources</h4>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li><Link to="/learn" className="hover:text-foreground">Learn Hub</Link></li>
                  <li><Link to="/community" className="hover:text-foreground">Community</Link></li>
                  <li><Link to="/security" className="hover:text-foreground">Security Center</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Legal</h4>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li><Link to="/terms" className="hover:text-foreground">Terms of Service</Link></li>
                  <li><Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
                  <li><Link to="/refund" className="hover:text-foreground">Refund Policy</Link></li>
                  <li>support@pumppilot.ai</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} PumpPilot AI. All rights reserved. Demo data only.
          </div>
        </div>
      </footer>
    </div>
  );
}
