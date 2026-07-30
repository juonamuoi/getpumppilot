import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE_URL, breadcrumbSchema, legalPageSchema, ldScript } from "@/lib/structured-data";

export const Route = createFileRoute("/risk-disclosure")({
  head: () => ({
    meta: withSocialMeta([
      { title: "Risk Disclosure — PumpPilot AI" },
      {
        name: "description",
        content:
          "Full risk disclosure for PumpPilot AI. Crypto trading is high risk. Predictions are probabilistic and you can lose all capital.",
      },
      { property: "og:title", content: "Risk Disclosure — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "Crypto momentum tools do not guarantee returns. Paper-trade first, size positions carefully, and never risk more than you can afford to lose.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE_URL}/risk-disclosure` },
      { name: "twitter:card", content: "summary" },
    ]),
    links: [{ rel: "canonical", href: `${SITE_URL}/risk-disclosure` }],
    scripts: [
      ldScript(
        legalPageSchema({
          name: "Risk Disclosure — PumpPilot AI",
          description:
            "Crypto momentum tools do not guarantee returns. Predictions are probabilistic and you can lose all capital.",
          path: "/risk-disclosure",
        }),
      ),
      ldScript(breadcrumbSchema([{ name: "Risk Disclosure", path: "/risk-disclosure" }])),
    ],
  }),
  component: RiskDisclosurePage,
});

function RiskDisclosurePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-black">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <span className="font-bold tracking-tight">PumpPilot AI</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" />
          <div className="text-sm text-amber-100/90">
            <strong>PumpPilot AI is an educational, paper-trading sandbox.</strong> Signals are
            probabilistic. Past performance never guarantees future results. You can lose all of
            your capital when trading crypto. Nothing here is investment, tax, or legal advice.
          </div>
        </div>

        <h1 className="mt-8 text-3xl font-bold tracking-tight">Risk Disclosure</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Crypto assets are high risk</h2>
            <p>
              Digital asset prices can move sharply and unpredictably. Liquidity, custody,
              regulatory status, and counterparty solvency all pose real risks. You should only
              deploy capital you can afford to lose entirely.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Signals are probabilistic</h2>
            <p>
              Momentum scores, backtests, and AI Copilot answers are model-driven estimates. They
              may be wrong, delayed, or based on incomplete data. They are not predictions of
              price and do not guarantee gains, avoid losses, or eliminate slippage.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Backtests overstate reality</h2>
            <p>
              Historical simulations do not include real-world slippage, fees, spread, gas, MEV,
              tax, exchange downtime, or your emotional response to drawdowns. Live results will
              differ, often materially.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Paper trading default; live trading disabled</h2>
            <p>
              PumpPilot AI defaults to paper trading. Live-execution adapters are shipped
              disabled and locked behind a master switch. We never request or store seed phrases,
              private keys, or exchange withdrawal credentials.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Demo and mock data</h2>
            <p>
              Some tickers (including <code>DEMO</code> small-caps) are fictional and labelled as
              such. Live prices for BTC, ETH, SOL, BNB are sourced from third-party public
              endpoints and may be delayed or briefly unavailable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Risk controls do not eliminate loss</h2>
            <p>
              Stop-losses, daily loss caps, and per-trade sizing reduce catastrophic outcomes but
              do not guarantee that any given trade closes at your requested price.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. No advice, no fiduciary duty</h2>
            <p>
              PumpPilot AI does not provide personalised financial, investment, tax, or legal
              advice. Consult a licensed professional before making financial decisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Your responsibilities</h2>
            <ul className="ml-5 list-disc space-y-1">
              <li>Verify your jurisdiction allows crypto trading and reporting.</li>
              <li>Keep wallet seed phrases offline; PumpPilot AI will never ask for them.</li>
              <li>Enable the app PIN / biometric lock on shared or mobile devices.</li>
              <li>Report suspected phishing or scam attempts via the Security Center.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Contact</h2>
            <p>
              Questions about this disclosure: <a href="mailto:support@pumppilot.ai" className="text-primary">support@pumppilot.ai</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 flex gap-3">
          <Button asChild variant="outline">
            <Link to="/terms">Terms of Service</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/privacy">Privacy Policy</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
