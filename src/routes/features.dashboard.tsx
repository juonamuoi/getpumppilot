import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Gauge,
  LineChart,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { FaqSection } from "@/components/faq-section";
import { DisclaimerBanner } from "@/components/disclaimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardTourFaqs } from "@/lib/page-faqs";
import { withSocialMeta } from "@/lib/social-meta";
import {
  ORG_ID,
  SITE_URL,
  SOCIAL_IMAGE_URL,
  WEBSITE_ID,
  breadcrumbSchema,
  faqSchema,
  ldScript,
  nodeId,
  pageEntityGraph,
  webPageSchema,
  canonicalLinks,
} from "@/lib/structured-data";

const PATH = "/features/dashboard";
const TITLE = "Crypto Momentum Dashboard — PumpPilot AI";
const DESC =
  "See how the PumpPilot AI dashboard works: explainable momentum scores, portfolio dollar-at-risk, live market pulse and stop-loss guidance. Paper trading, no wallet needed.";
const OG_DESC =
  "Explainable momentum scores, dollar-at-risk and stop-loss guidance on one screen — no wallet required.";
const IMAGE_ALT = "PumpPilot AI dashboard with momentum signals and portfolio overview";

export const Route = createFileRoute("/features/dashboard")({
  head: () => ({
    links: canonicalLinks(PATH),
    meta: withSocialMeta([
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: "The PumpPilot AI momentum dashboard" },
      { property: "og:description", content: OG_DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}${PATH}` },
      { property: "og:image", content: SOCIAL_IMAGE_URL },
      { property: "og:image:alt", content: IMAGE_ALT },
      { name: "twitter:image:alt", content: IMAGE_ALT },
    ]),
    scripts: [
      ldScript(
        pageEntityGraph([
          {
            ...webPageSchema({
              name: TITLE,
              description: DESC,
              path: PATH,
              type: "WebPage",
            }),
            primaryImageOfPage: { "@type": "ImageObject", url: SOCIAL_IMAGE_URL },
            about: {
              "@type": "SoftwareApplication",
              "@id": nodeId(PATH, "app"),
              name: "PumpPilot AI Dashboard",
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web, iOS, Android",
              isAccessibleForFree: true,
              featureList: [
                "Explainable momentum scores with factor breakdowns",
                "Portfolio value and dollar-at-risk overview",
                "Live market pulse across tracked assets",
                "Stop-loss and take-profit guidance per position",
                "Paper trading only — live execution locked by default",
              ],
              publisher: { "@id": ORG_ID },
            },
            isPartOf: { "@id": WEBSITE_ID },
            publisher: { "@id": ORG_ID },
          },
          faqSchema(dashboardTourFaqs, PATH),
          breadcrumbSchema([
            { name: "Features", path: "/features" },
            { name: "Dashboard", path: PATH },
          ]),
        ]),
      ),
    ],
  }),
  component: DashboardOverviewPage,
});

const PANELS = [
  {
    icon: Gauge,
    title: "Momentum scores you can argue with",
    body: "Each tracked asset gets a 0–100 momentum score built from trend strength, volume expansion and volatility. The card shows the factor breakdown and a written 'why' line, so a score is a claim you can check — not a black box number.",
  },
  {
    icon: ShieldCheck,
    title: "Dollar-at-risk, not just P&L",
    body: "The portfolio header leads with how much money is actually exposed if every stop-loss triggers today. Position size, stop distance and concurrent-position caps are shown next to the value, so risk is visible before performance.",
  },
  {
    icon: Activity,
    title: "Live market pulse",
    body: "A compact market strip tracks the whole watchlist at once: movers, fading names, and assets crossing your alert thresholds, each with a sparkline so a spike is obvious at a glance.",
  },
  {
    icon: Bot,
    title: "AI copilot in plain English",
    body: "Ask 'why is this asset moving?' or 'what is my biggest risk right now?' and get a short answer grounded in the same signals on screen, with the reasoning shown rather than hidden.",
  },
  {
    icon: LineChart,
    title: "Paper positions with guidance",
    body: "Every simulated position carries suggested stop-loss and take-profit levels plus the risk-per-trade it consumes, so sizing discipline is part of the screen instead of an afterthought.",
  },
  {
    icon: BarChart3,
    title: "Everything feeds the journal",
    body: "Simulated fills are logged automatically and roll up into win rate, expectancy and an equity curve on the trade journal — no manual spreadsheet.",
  },
];

const STATS = [
  { label: "Signal factors per score", value: "3", sub: "Trend, volume, volatility" },
  { label: "Execution mode", value: "Paper", sub: "Live adapter locked" },
  { label: "Wallet permissions", value: "Read-only", sub: "No seed phrase, ever" },
  { label: "Setup time", value: "< 2 min", sub: "Demo data preloaded" },
];

function DashboardOverviewPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8 p-4 lg:p-8">
        <PageBreadcrumbs
          crumbs={[
            { name: "Features", path: "/features" },
            { name: "Dashboard", path: PATH },
          ]}
        />

        <header className="space-y-4">
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" aria-hidden /> Public product overview
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
            The PumpPilot AI crypto momentum dashboard
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            One screen that answers three questions: what is moving, why it is moving, and how much
            money you have at risk if you are wrong. Momentum scores are explainable, every position
            carries a stop-loss suggestion, and the whole dashboard runs in paper trading mode on
            clearly labelled demo data.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/dashboard">
                Open the live demo dashboard <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/features/journal">See the trade journal</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/pricing">Credits &amp; pricing</Link>
            </Button>
          </div>
        </header>

        <DisclaimerBanner />

        <section aria-labelledby="at-a-glance" className="space-y-3">
          <h2 id="at-a-glance" className="text-xl font-semibold">
            At a glance
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => (
              <Card key={s.label} className="border-border/60 bg-card/60">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </div>
                  <div className="mt-1 font-mono text-2xl font-bold">{s.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="whats-on-it" className="space-y-3">
          <h2 id="whats-on-it" className="text-xl font-semibold">
            What is on the dashboard
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {PANELS.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="border-border/60 bg-card/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-primary" aria-hidden />
                    {title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="reading-a-signal" className="space-y-3">
          <h2 id="reading-a-signal" className="text-xl font-semibold">
            How to read a momentum signal
          </h2>
          <Card className="border-border/60 bg-card/60">
            <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">1. Score.</span> The headline 0–100
                number ranks how strongly an asset is trending right now relative to its own recent
                behaviour — not against the rest of the market.
              </p>
              <p>
                <span className="font-medium text-foreground">2. Factors.</span> Trend, volume and
                volatility are shown separately. A high score carried entirely by volatility is a
                different setup from one carried by sustained volume.
              </p>
              <p>
                <span className="font-medium text-foreground">3. Why line.</span> A one-sentence
                plain-English explanation names the factor doing the work, so you can disagree with
                the model on the evidence.
              </p>
              <p>
                <span className="font-medium text-foreground">4. Risk.</span> Before any simulated
                entry, the card shows suggested stop distance and the share of your risk budget the
                position would consume.
              </p>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="safety" className="space-y-3">
          <h2 id="safety" className="text-xl font-semibold">
            Safety by default
          </h2>
          <Card className="border-border/60 bg-card/60">
            <CardContent className="space-y-2 p-5 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                Live execution ships disabled behind a locked master switch. The default mode is
                paper trading and nothing on the dashboard can move real funds.
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                Wallet connection is optional and read-only. PumpPilot AI never asks for a seed
                phrase or private key, and it scans a connected address for known drainers and risky
                token approvals.
              </p>
            </CardContent>
          </Card>
        </section>

        <FaqSection faqs={dashboardTourFaqs} title="Dashboard FAQ" />

        <section className="rounded-lg border border-border/60 bg-card/60 p-6">
          <h2 className="text-lg font-semibold">Try it with demo data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The in-app dashboard is preloaded with labelled demo assets, so you can explore every
            panel before connecting anything.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/dashboard">Open the dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/learn">Learn the basics first</Link>
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
