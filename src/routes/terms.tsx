import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE_URL, breadcrumbSchema, legalPageSchema, ldScript } from "@/lib/structured-data";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — PumpPilot AI" },
      {
        name: "description",
        content: "Terms of Service for PumpPilot AI. Educational crypto dashboard with paper trading.",
      },
      { property: "og:title", content: "Terms of Service — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "The rules for using PumpPilot AI: educational use only, paper trading by default, and no guarantee of investment returns.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE_URL}/terms` },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/terms` }],
    scripts: [
      ldScript(
        legalPageSchema({
          name: "Terms of Service — PumpPilot AI",
          description:
            "The rules for using PumpPilot AI: educational use only, paper trading by default, and no guarantee of investment returns.",
          path: "/terms",
        }),
      ),
      ldScript(breadcrumbSchema([{ name: "Terms of Service", path: "/terms" }])),
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-black">
              <FlaskConical className="h-4 w-4" />
            </div>
            <span className="font-bold tracking-tight">PumpPilot AI</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">Back to PumpPilot AI home</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Educational service</h2>
            <p className="mt-2">
              PumpPilot AI provides an educational dashboard for tracking simulated crypto portfolios,
              exploring momentum signals and practising rule-based strategies. All trading in the app is
              paper trading by default. Live execution is disabled and locked.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Not financial advice</h2>
            <p className="mt-2">
              Nothing on PumpPilot AI is financial, investment, tax or legal advice. Signals, scores,
              predictions and community strategies are for educational purposes only. You are solely
              responsible for any financial decisions you make.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Accounts and subscriptions</h2>
            <p className="mt-2">
              Some features require a paid subscription. Payments are processed by Stripe. You may cancel
              at any time through the billing portal. If you cancel, you retain access until the end of your
              current billing period. Upgrades are prorated; downgrades take effect at the next renewal.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Prohibited use</h2>
            <p className="mt-2">
              You may not use PumpPilot AI for market manipulation, unlawful activity, harassment,
              scraping, reverse engineering, or attempting to bypass the live-execution lock.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Limitation of liability</h2>
            <p className="mt-2">
              PumpPilot AI is provided "as is" without warranties of any kind. We are not liable for any
              losses, including trading losses, arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Changes</h2>
            <p className="mt-2">
              We may update these terms at any time. Continued use of the service after changes constitutes
              acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
            <p className="mt-2">Questions? Email support@pumppilot.ai.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
