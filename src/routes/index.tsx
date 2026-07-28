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
  Users,
  ArrowRight,
  Check,
  Star,
  Trophy,
  Brain,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackCtaClick } from "@/lib/funnel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth-store";
import { WaitlistForm } from "@/components/waitlist-form";


import { CREDIT_PACKS } from "@/lib/credits";
import {
  SITE_URL,
  ORG_ID,
  WEBSITE_ID,
  LOGO_URL,
  faqSchema as buildFaqSchema,
  ldScript,
} from "@/lib/structured-data";
const TITLE = "PumpPilot AI — AI Crypto Momentum & Paper Trading";
const DESCRIPTION =
  "Explainable AI for crypto: momentum scanner, paper trading, AI coaching and strict risk controls. Start free with demo data — no seed phrases required.";

const faqs = [
  {
    q: "Is PumpPilot AI the best AI investment app for crypto?",
    a: "PumpPilot AI is built for investors who want explainable AI signals instead of black-box calls. Every momentum score shows the exact rules that fired, you can paper trade before risking capital, and risk controls are on by default. That combination — explainability, safety and coaching — is what makes it the top pick for people who take investing seriously.",
  },
  {
    q: "How does PumpPilot AI compare to other AI trading apps?",
    a: "Most AI trading apps push live execution with opaque signals. PumpPilot AI locks live execution by default, defaults to paper trading, and pairs every signal with a plain-English explanation, an AI Copilot and a Portfolio Doctor audit — so you learn the reasoning, not just the trade.",
  },
  {
    q: "Is PumpPilot AI safe? Do you store my seed phrase?",
    a: "No. PumpPilot AI never requests or stores seed phrases or private keys. Wallet connection is read-only, origin checks flag phishing attempts, and the Security Center logs every blocked event with a full CSV/JSON audit trail.",
  },
  {
    q: "Can I make money with PumpPilot AI?",
    a: "PumpPilot AI is an educational sandbox. Predictions are probabilistic, returns are not guaranteed, and you can lose all capital. The platform is designed to help you build disciplined strategies, backtest them, and understand risk before ever placing a real trade elsewhere.",
  },
  {
    q: "What does the free plan include?",
    a: "There is no subscription. You recharge the app with credits and spend them only when the AI works for you — 1 credit per momentum prediction or bot order, 2 per Copilot answer, 5 per backtest, 10 per Portfolio Doctor audit. Every new account gets 100 free credits, and packs start at $9 for 500 credits. When your balance hits zero the bot simply stops predicting and executing until you top up. Credits never expire.",
  },
  {
    q: "Do I need to connect a real wallet?",
    a: "No. Paper trading works with zero wallet setup. When you do connect a wallet it is read-only — PumpPilot AI cannot move funds, sign transactions or access your keys.",
  },
];

const features = [
  {
    icon: Radar,
    title: "Momentum Scanner",
    desc: "Explainable momentum scores for BTC, ETH, SOL, BNB and demo small-cap tokens.",
  },
  {
    icon: Bot,
    title: "AI Copilot",
    desc: "Ask questions in plain English and get risk-aware coaching powered by Gemini 2.5.",
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

const comparison = [
  { label: "Explainable AI signals (see the rules that fired)", us: true, them: false },
  { label: "Paper trading by default", us: true, them: false },
  { label: "Live execution locked until you opt in", us: true, them: false },
  { label: "Never asks for seed phrases", us: true, them: "Sometimes" },
  { label: "AI Copilot with risk coaching", us: true, them: false },
  { label: "Full backtesting engine", us: true, them: "Paid tier" },
  { label: "Free tier with real functionality", us: true, them: "Trial only" },
];

const testimonials = [
  {
    quote:
      "The explainable scores are the difference. I finally understand why a signal fires instead of guessing.",
    name: "Alex R.",
    role: "Retail investor",
  },
  {
    quote:
      "Paper trading + the Trade Journal turned my ‘gut trades’ into an actual measurable system.",
    name: "Priya S.",
    role: "Part-time trader",
  },
  {
    quote:
      "Portfolio Doctor caught a concentration risk I completely missed. Worth Pro on its own.",
    name: "Marco D.",
    role: "Crypto enthusiast",
  },
];

const plans = [
  {
    name: "Welcome credits",
    price: "$0",
    period: "on signup",
    features: [
      "100 free credits, no card needed",
      "Dashboard, scanner & alerts",
      "Paper trading",
      "Community & Security Center",
      "Credits never expire",
    ],
    cta: "Start free",
    href: "/auth",
    highlight: false,
  },
  {
    name: "Trader pack",
    price: "$29",
    period: "one-time",
    features: [
      "2,000 credits",
      "2,000 momentum predictions",
      "400 backtests",
      "200 Portfolio Doctor audits",
      "No subscription, no auto-renewal",
    ],
    cta: "Recharge credits",
    href: "/pricing",
    highlight: true,
  },
  {
    name: "Quant pack",
    price: "$99",
    period: "one-time",
    features: [
      "8,000 credits",
      "Best value per credit",
      "AI Copilot, Journal & API access",
      "Bot execution at 1 credit per order",
      "Top up any time",
    ],
    cta: "Buy credits",
    href: "/pricing",
    highlight: false,
  },
];
const homeFaqSchema = buildFaqSchema(faqs);

const productSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#app`,
  name: "PumpPilot AI",
  applicationCategory: "FinanceApplication",
  applicationSubCategory: "Crypto momentum scanner & paper trading",
  operatingSystem: "Web, iOS, Android",
  description: DESCRIPTION,
  url: SITE_URL,
  image: LOGO_URL,
  inLanguage: "en",
  publisher: { "@id": ORG_ID },
  isPartOf: { "@id": WEBSITE_ID },
  featureList: [
    "Explainable crypto momentum scores",
    "Market scanner with configurable alert rules",
    "Paper trading sandbox (live execution locked by default)",
    "Strategy builder and backtesting",
    "AI Copilot coaching and Portfolio Doctor audits",
    "Wallet phishing and drainer-approval scanning",
  ],
  // Pay-as-you-go credit packs — mirrors the /pricing page exactly.
  offers: CREDIT_PACKS.map((pack) => ({
    "@type": "Offer",
    name: `${pack.name} — ${pack.credits.toLocaleString()} credits`,
    price: (pack.amountCents / 100).toFixed(2),
    priceCurrency: "USD",
    category: "One-time credit pack",
    url: `${SITE_URL}/pricing`,
    availability: "https://schema.org/InStock",
  })),
};

const homeWebPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${SITE_URL}/#webpage`,
  name: TITLE,
  description: DESCRIPTION,
  url: SITE_URL,
  inLanguage: "en",
  isPartOf: { "@id": WEBSITE_ID },
  about: { "@id": `${SITE_URL}/#app` },
  primaryImageOfPage: { "@type": "ImageObject", url: LOGO_URL },
};


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "best AI investment app, AI crypto trading app, AI trading simulator, crypto paper trading, explainable AI trading signals, crypto momentum scanner, AI portfolio analysis",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:site_name", content: "PumpPilot AI" },
      { property: "og:image", content: `${SITE_URL}/favicon.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: `${SITE_URL}/favicon.png` },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(productSchema),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(faqSchema),
      },
    ],
  }),
  component: LandingPage,
});

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
            <img
              src="/favicon.png"
              alt="PumpPilot AI logo"
              className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-lg shadow-emerald-500/20"
            />
            <div>
              <div className="text-sm font-bold tracking-tight">PumpPilot AI</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Paper mode
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href="#features">Features</a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/pricing">Pricing</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/blog">Blog</Link>
            </Button>
            <Button size="sm" asChild onClick={() => void trackCtaClick("nav")}>
              <Link to={launchHref}>{launchLabel}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-12 pb-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl text-center">
          <img
            src="/favicon.png"
            alt="PumpPilot AI mascot — AI robot pumping crypto into a wallet while you sleep"
            width={160}
            height={160}
            fetchPriority="high"
            decoding="async"
            className="mx-auto mb-6 h-32 w-32 rounded-3xl object-cover shadow-2xl shadow-emerald-500/10 sm:h-40 sm:w-40"
          />
          <Badge
            variant="outline"
            className="mb-4 border-emerald-500/30 px-3 py-1 text-emerald-300"
          >
            <Lock className="mr-1.5 h-3 w-3" /> Live execution locked — paper trading only
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            The best AI investment app <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              for explainable crypto momentum.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Spot momentum. Control risk. Trade smarter. PumpPilot AI pairs an explainable momentum
            scanner with paper trading, AI coaching and hard risk controls — so you learn how the
            signal works before you ever put real money on the line.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild onClick={() => void trackCtaClick("hero")}>
              <Link to={launchHref}>
                {launchLabel} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/learn">See how it works</Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> No seed phrases stored
            </span>
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3.5 w-3.5 text-emerald-400" /> Live trades disabled by default
            </span>
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-amber-400" /> 4.8 avg from early users
            </span>
          </div>
        </div>
      </section>

      {/* Why PumpPilot */}
      <section className="border-y border-border/60 bg-muted/10 px-4 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Why PumpPilot AI is the top pick for AI-driven crypto investing
            </h2>
            <p className="mt-2 text-muted-foreground">
              Three principles other AI trading apps skip.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Eye,
                title: "Explainable, not magical",
                desc: "Every momentum score shows the exact rules that fired and by how much — no black-box calls.",
              },
              {
                icon: ShieldCheck,
                title: "Safety on by default",
                desc: "Paper trading is the default. Live execution is locked. Phishing detection is always on.",
              },
              {
                icon: Brain,
                title: "Coaching, not gambling",
                desc: "AI Copilot and Portfolio Doctor teach you why a decision is risky before you make it.",
              },
            ].map((v) => (
              <Card key={v.title} className="border-border/60 bg-card/60">
                <CardContent className="p-5">
                  <v.icon className="h-8 w-8 text-emerald-400" />
                  <h3 className="mt-3 font-semibold">{v.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{v.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Everything you need to invest with discipline
            </h2>
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

      {/* Comparison */}
      <section className="border-y border-border/60 bg-muted/20 px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              PumpPilot AI vs. typical AI trading apps
            </h2>
            <p className="mt-2 text-muted-foreground">
              Built for investors who want to understand the signal — not gamble on it.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-3 text-left font-semibold">Capability</th>
                  <th className="p-3 text-center font-semibold text-emerald-300">PumpPilot AI</th>
                  <th className="p-3 text-center font-semibold text-muted-foreground">
                    Typical AI trading app
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.label} className="border-t border-border/60">
                    <td className="p-3">{row.label}</td>
                    <td className="p-3 text-center">
                      {row.us === true ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-400" />
                      ) : (
                        <span className="text-muted-foreground">{String(row.us)}</span>
                      )}
                    </td>
                    <td className="p-3 text-center text-muted-foreground">
                      {row.them === true ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-400" />
                      ) : row.them === false ? (
                        <span>—</span>
                      ) : (
                        <span>{row.them}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Trusted by disciplined traders
            </h2>
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              4.8 average from 127 early users
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className="border-border/60 bg-card/60">
                <CardContent className="p-5">
                  <Trophy className="h-6 w-6 text-emerald-400" />
                  <p className="mt-3 text-sm">"{t.quote}"</p>
                  <div className="mt-4 text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground">{t.name}</div>
                    {t.role}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Active community & leaderboards
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Read-only wallet connect
            </span>
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" /> Live trades opt-in only
            </span>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-border/60 bg-muted/20 px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Simple pricing</h2>
            <p className="mt-2 text-muted-foreground">
              Start free. Upgrade when you're ready to go deeper.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <Card
                key={p.name}
                className={`flex flex-col p-6 ${
                  p.highlight
                    ? "border-emerald-500/50 ring-1 ring-emerald-500/30"
                    : "border-border/60 bg-card/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {p.highlight && (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 border">
                      Most popular
                    </Badge>
                  )}
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
                <Button
                  className="mt-6 w-full"
                  variant={p.highlight ? "default" : "outline"}
                  asChild
                  onClick={() => void trackCtaClick(`pricing_${p.name.toLowerCase()}`)}
                >
                  <Link to={p.href}>{p.cta}</Link>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Frequently asked questions
            </h2>
            <p className="mt-2 text-muted-foreground">
              Everything you need to know about the best AI investment app for crypto.
            </p>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to trade smarter?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Create a free account, paper-trade with explainable signals, and only upgrade when
            PumpPilot AI is actively saving you time and mistakes.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild onClick={() => void trackCtaClick("footer_cta")}>
              <Link to={launchHref}>
                {launchLabel} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
          <div className="mt-8 border-t border-border/40 pt-6">
            <h3 className="text-sm font-semibold">
              Not ready yet? Join the waitlist
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Get a confirmation email now, plus a short follow-up when new
              momentum features land.
            </p>
            <div className="mt-4">
              <WaitlistForm source="landing-cta" />
            </div>
          </div>
        </div>
      </section>


      {/* Trust / disclaimers */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-3xl space-y-6 text-sm text-muted-foreground">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <h3 className="flex items-center gap-2 font-semibold text-amber-300">
              <TrendingUp className="h-4 w-4" /> Important disclaimer
            </h3>
            <p className="mt-2">
              PumpPilot AI is an educational trading sandbox. All prices, signals and portfolio data
              shown in paper mode are simulated or clearly labelled as demo. Predictions are
              probabilistic, returns are not guaranteed, and you can lose all capital. Nothing on
              this site is financial advice. Live execution is disabled and locked by default.
            </p>
          </div>
          <p>
            <strong className="text-foreground">Security first.</strong> We never request or store
            seed phrases or private keys. Wallet connection is read-only and runs origin checks to
            detect phishing attempts.
          </p>
          <p>
            <strong className="text-foreground">Subscriptions.</strong> Cancel any time through the
            billing portal. If you cancel, you keep access until the end of your current billing
            period. Upgrades apply immediately and are prorated; downgrades apply at the next
            renewal.
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
                Educational crypto dashboard with explainable momentum, paper trading and AI
                coaching.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-3 text-sm">
              <div>
                <h4 className="font-semibold text-foreground">Product</h4>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>
                    <Link to="/scanner" className="hover:text-foreground">
                      Scanner
                    </Link>
                  </li>
                  <li>
                    <Link to="/paper" className="hover:text-foreground">
                      Paper Trading
                    </Link>
                  </li>
                  <li>
                    <Link to="/strategy" className="hover:text-foreground">
                      Strategies
                    </Link>
                  </li>
                  <li>
                    <Link to="/pricing" className="hover:text-foreground">
                      Pricing
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Resources</h4>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>
                    <Link to="/blog" className="hover:text-foreground">
                      Blog
                    </Link>
                  </li>
                  <li>
                    <Link to="/learn" className="hover:text-foreground">
                      Learn Hub
                    </Link>
                  </li>
                  <li>
                    <Link to="/community" className="hover:text-foreground">
                      Community
                    </Link>
                  </li>
                  <li>
                    <Link to="/security" className="hover:text-foreground">
                      Security Center
                    </Link>
                  </li>
                  <li>
                    <Link to="/developers" className="hover:text-foreground">
                      Widgets & API
                    </Link>
                  </li>


                  <li>
                    <a href="#faq" className="hover:text-foreground">
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Legal</h4>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>
                    <Link to="/terms" className="hover:text-foreground">
                      Terms of Service
                    </Link>
                  </li>
                  <li>
                    <Link to="/privacy" className="hover:text-foreground">
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <Link to="/refund" className="hover:text-foreground">
                      Refund Policy
                    </Link>
                  </li>
                  <li>
                    <Link to="/risk-disclosure" className="hover:text-foreground">
                      Risk Disclosure
                    </Link>
                  </li>
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
