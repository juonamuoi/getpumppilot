import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gauge, LineChart } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withSocialMeta } from "@/lib/social-meta";
import {
  ORG_ID,
  SITE_URL,
  SOCIAL_IMAGE_URL,
  WEBSITE_ID,
  breadcrumbSchema,
  ldScript,
  nodeId,
  pageEntityGraph,
  webPageSchema,
} from "@/lib/structured-data";

const PATH = "/features";
const TITLE = "Features — PumpPilot AI Crypto Momentum Tools";
const DESC =
  "Public walkthroughs of the PumpPilot AI product: the explainable momentum dashboard and the paper trading performance journal. No wallet connection required.";

const PAGES = [
  {
    to: "/features/dashboard" as const,
    icon: Gauge,
    title: "Momentum dashboard",
    body: "Explainable momentum scores, portfolio dollar-at-risk, live market pulse and stop-loss guidance on one screen.",
  },
  {
    to: "/features/journal" as const,
    icon: LineChart,
    title: "Paper trading journal",
    body: "Win rate, expectancy, profit factor, equity curve and per-asset attribution, logged automatically from simulated fills.",
  },
];

export const Route = createFileRoute("/features/")({
  head: () => ({
    links: [{ rel: "canonical", href: `${SITE_URL}${PATH}` }],
    meta: withSocialMeta([
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: "PumpPilot AI features" },
      {
        property: "og:description",
        content: "Walk through the momentum dashboard and paper trading journal — no wallet needed.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}${PATH}` },
      { property: "og:image", content: SOCIAL_IMAGE_URL },
    ]),
    scripts: [
      ldScript(
        pageEntityGraph([
          {
            ...webPageSchema({
              name: TITLE,
              description: DESC,
              path: PATH,
              type: "CollectionPage",
            }),
            mainEntity: {
              "@type": "ItemList",
              "@id": nodeId(PATH, "features"),
              name: "PumpPilot AI feature walkthroughs",
              itemListElement: PAGES.map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: p.title,
                url: `${SITE_URL}${p.to}`,
              })),
            },
            isPartOf: { "@id": WEBSITE_ID },
            publisher: { "@id": ORG_ID },
          },
          breadcrumbSchema([{ name: "Features", path: PATH }]),
        ]),
      ),
    ],
  }),
  component: FeaturesIndexPage,
});

function FeaturesIndexPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-8 p-4 lg:p-8">
        <PageBreadcrumbs crumbs={[{ name: "Features", path: PATH }]} />
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
            PumpPilot AI feature walkthroughs
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Public, wallet-free explanations of how the product works — what each screen shows, how
            the numbers are calculated, and where the honest limits are.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {PAGES.map(({ to, icon: Icon, title, body }) => (
            <Card key={to} className="border-border/60 bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-primary" aria-hidden />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{body}</p>
                <Button asChild variant="outline" size="sm">
                  <Link to={to}>
                    Read the walkthrough <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
