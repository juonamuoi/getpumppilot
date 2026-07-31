import { createFileRoute, Link } from "@tanstack/react-router";
import { ATOM_PATH, RSS_PATH } from "@/lib/feed";
import {
  ArrowRight,
  Award,
  BarChart3,
  ClipboardList,
  LineChart,
  Percent,
  Scale,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { FaqSection } from "@/components/faq-section";
import { DisclaimerBanner } from "@/components/disclaimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { journalTourFaqs } from "@/lib/page-faqs";
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
} from "@/lib/structured-data";

const PATH = "/features/journal";
const TITLE = "Paper Trading Journal & Performance Analytics — PumpPilot AI";
const DESC =
  "How the PumpPilot AI trade journal works: automatic paper-trade logging, win rate, expectancy, profit factor, equity curve and per-asset attribution. No wallet required.";
const OG_DESC =
  "Win rate, expectancy, profit factor and equity curve — measure your paper trading edge automatically.";
const IMAGE_ALT = "PumpPilot AI trade journal with equity curve and win-rate stats";

export const Route = createFileRoute("/features/journal")({
  head: () => ({
    links: [{ rel: "canonical", href: `${SITE_URL}${PATH}` }],
    meta: withSocialMeta([
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: "The PumpPilot AI trade journal" },
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
              "@type": "Thing",
              name: "Paper trading performance analytics",
              description:
                "Win rate, expectancy, profit factor, equity curve and per-asset attribution for simulated crypto trades.",
            },
            mainEntity: {
              "@type": "ItemList",
              "@id": nodeId(PATH, "metrics"),
              name: "Metrics tracked by the PumpPilot AI trade journal",
              itemListElement: METRIC_NAMES.map((name, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name,
              })),
            },
            isPartOf: { "@id": WEBSITE_ID },
            publisher: { "@id": ORG_ID },
          },
          faqSchema(journalTourFaqs, PATH),
          breadcrumbSchema([
            { name: "Features", path: "/features" },
            { name: "Trade journal", path: PATH },
          ]),
        ]),
      ),
    ],
  }),
  component: JournalOverviewPage,
});

const METRICS = [
  {
    icon: Percent,
    name: "Win rate",
    formula: "wins ÷ total trades",
    body: "The share of simulated trades that closed green. Useful, but meaningless on its own — a 30% win rate can beat a 70% one when the winners are larger.",
  },
  {
    icon: Scale,
    name: "Expectancy",
    formula: "(win% × avg win) − (loss% × avg loss)",
    body: "The average dollar result you can expect per trade. Positive expectancy is the single number that says a process is worth repeating.",
  },
  {
    icon: TrendingUp,
    name: "Profit factor",
    formula: "gross profit ÷ gross loss",
    body: "How many dollars the strategy earned for every dollar it gave back. Below 1.0 means the losers are paying for the winners.",
  },
  {
    icon: Award,
    name: "Avg win vs avg loss",
    formula: "payoff ratio",
    body: "Shows whether your exits let winners run. A payoff ratio under 1 with a low win rate is the classic bleed pattern.",
  },
  {
    icon: LineChart,
    name: "Equity curve",
    formula: "cumulative simulated P&L",
    body: "The shape matters more than the endpoint: steady steps beat one lucky spike, and the deepest drawdown tells you what you would have had to sit through.",
  },
  {
    icon: BarChart3,
    name: "Per-asset attribution",
    formula: "P&L split by symbol",
    body: "Breaks results down by asset so you can see whether the edge is real or came from one lucky name.",
  },
];

const METRIC_NAMES = [
  "Win rate",
  "Expectancy",
  "Profit factor",
  "Average win versus average loss",
  "Equity curve",
  "Per-asset attribution",
];

function JournalOverviewPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-8 p-4 lg:p-8">
        <PageBreadcrumbs
          crumbs={[
            { name: "Features", path: "/features" },
            { name: "Trade journal", path: PATH },
          ]}
        />

        <header className="space-y-4">
          <Badge variant="outline" className="gap-1">
            <ClipboardList className="h-3 w-3" aria-hidden /> Public product overview
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
            The PumpPilot AI paper trading journal
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Most traders cannot say whether their strategy works, because nobody keeps the
            spreadsheet. PumpPilot AI logs every simulated fill automatically and turns it into the
            six numbers that actually describe an edge — win rate, expectancy, profit factor, payoff
            ratio, equity curve and per-asset attribution.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/journal">
                Open the live demo journal <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/features/dashboard">See the dashboard</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/paper">Start paper trading</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Subscribe to new journal articles:{" "}
            <a href={RSS_PATH} className="underline hover:text-foreground">RSS</a>{" "}
            ·{" "}
            <a href={ATOM_PATH} className="underline hover:text-foreground">Atom</a>
          </p>
        </header>

        <DisclaimerBanner />

        <section aria-labelledby="metrics" className="space-y-3">
          <h2 id="metrics" className="text-xl font-semibold">
            The six metrics, explained
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {METRICS.map(({ icon: Icon, name, formula, body }) => (
              <Card key={name} className="border-border/60 bg-card/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-primary" aria-hidden />
                    {name}
                  </CardTitle>
                  <div className="font-mono text-xs text-muted-foreground">{formula}</div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="workflow" className="space-y-3">
          <h2 id="workflow" className="text-xl font-semibold">
            How the journal fills itself
          </h2>
          <Card className="border-border/60 bg-card/60">
            <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">1. A rule fires.</span> A scanner rule
                or strategy matches a demo asset and opens a simulated position with a stop-loss and
                take-profit attached.
              </p>
              <p>
                <span className="font-medium text-foreground">2. The trade is recorded.</span> Entry,
                exit, size, the triggering rule and the risk consumed are written to the journal the
                moment the simulated order fills — nothing to type.
              </p>
              <p>
                <span className="font-medium text-foreground">3. Stats recompute.</span> Win rate,
                expectancy, profit factor and the equity curve update instantly, along with the
                per-asset breakdown.
              </p>
              <p>
                <span className="font-medium text-foreground">4. You tune, then re-check.</span>{" "}
                Change a threshold in the rule tuner, replay the same window, and compare the new
                journal statistics against the old run before you keep the change.
              </p>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="honest" className="space-y-3">
          <h2 id="honest" className="text-xl font-semibold">
            What the numbers cannot tell you
          </h2>
          <Card className="border-border/60 bg-card/60">
            <CardContent className="space-y-2 p-5 text-sm text-muted-foreground">
              <p>
                Simulated fills assume you get the price you asked for. Real markets add slippage,
                fees and thin liquidity, all of which reduce results — often most on exactly the
                fast-moving assets momentum strategies favour.
              </p>
              <p>
                A short sample is noise. Twenty trades cannot separate skill from luck; judge a
                process over a few hundred and watch whether expectancy holds across different
                market regimes.
              </p>
              <p>
                Everything here runs on clearly labelled demo data. It is educational, not financial
                advice, and past simulated performance never guarantees future returns.
              </p>
            </CardContent>
          </Card>
        </section>

        <FaqSection faqs={journalTourFaqs} title="Trade journal FAQ" />

        <section className="rounded-lg border border-border/60 bg-card/60 p-6">
          <h2 className="text-lg font-semibold">See your own numbers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Place a few paper trades and the journal builds itself. No wallet, no real funds, no
            spreadsheet.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/paper">Open paper trading</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/journal">View the demo journal</Link>
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
