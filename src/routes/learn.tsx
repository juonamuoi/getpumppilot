import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GLOSSARY } from "@/components/glossary";
import { BookOpen, GraduationCap, Lightbulb, ShieldCheck, TrendingUp } from "lucide-react";
import {
  SITE_URL,
  ORG_ID,
  breadcrumbSchema,
  webPageSchema,
  ldScript,
} from "@/lib/structured-data";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn — PumpPilot AI" },
      { name: "description", content: "Micro-lessons and a glossary to help you understand momentum trading, risk, and how PumpPilot's signals work." },
      { property: "og:title", content: "PumpPilot AI Learn hub" },
      { property: "og:description", content: "Short, plain-English lessons on momentum, risk and reading signals." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/learn` },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/learn` }],
    scripts: [
      ldScript({
        ...webPageSchema({
          name: "Learn momentum trading and risk — PumpPilot AI",
          description:
            "Micro-lessons and a glossary covering momentum trading, reading signals, position sizing and risk control.",
          path: "/learn",
          type: "LearningResource",
        }),
        learningResourceType: "Lesson series",
        educationalLevel: "Beginner",
        teaches: [
          "What momentum trading is",
          "How to read an explainable signal card",
          "Position sizing and stop-loss discipline",
          "Why probabilistic predictions are not guarantees",
        ],
        provider: { "@id": ORG_ID },
        isAccessibleForFree: true,
      }),
      ldScript(breadcrumbSchema([{ name: "Learn", path: "/learn" }])),
    ],
  }),
  component: LearnPage,
});

const LESSONS = [
  {
    icon: TrendingUp,
    title: "What is momentum trading?",
    body: "Momentum trading buys assets that are already going up and sells them when the move fades. It doesn't try to pick bottoms. It works best in trending markets and gets chopped up when prices go sideways.",
  },
  {
    icon: Lightbulb,
    title: "How to read a signal card",
    body: "Each card gives you: a plain-English headline, a suggested action (Watch / Consider buy / Trim / Avoid), a confidence label, and the WHY behind it. Confidence is not certainty — even 'High' signals can fail.",
  },
  {
    icon: ShieldCheck,
    title: "Position sizing is your seatbelt",
    body: "No single trade should be able to take out your account. A common rule: never risk more than 1–2% of equity on a single idea. PumpPilot's risk controls enforce a max position % for you.",
  },
  {
    icon: GraduationCap,
    title: "Why we use paper trading",
    body: "You learn to click the right buttons, stomach the swings, and see whether your strategy actually works — without a single dollar of risk. When live execution eventually unlocks, you'll be ready.",
  },
];

function LearnPage() {
  const terms = Object.entries(GLOSSARY).sort(([a], [b]) => a.localeCompare(b));

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
            <BookOpen className="h-3.5 w-3.5" /> Learn hub
          </div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Learn AI Crypto Trading — PumpPilot AI Education Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Short lessons and a glossary. If you can explain it, you can trade it.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {LESSONS.map((l) => {
            const Icon = l.icon;
            return (
              <Card key={l.title} className="border-border/60 bg-card/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-emerald-400" /> {l.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{l.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-border/60 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Glossary</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {terms.map(([k, v]) => (
                <AccordionItem key={k} value={k}>
                  <AccordionTrigger className="capitalize">{k}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{v}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
