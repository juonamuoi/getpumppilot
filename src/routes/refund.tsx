import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE_URL, breadcrumbSchema, legalPageSchema, ldScript } from "@/lib/structured-data";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: withSocialMeta([
      { title: "Refund Policy — PumpPilot AI" },
      {
        name: "description",
        content:
          "How PumpPilot AI handles refunds for credit purchases: eligibility windows, unused credit balances, failed payments and how to request a refund from support.",
      },
      { property: "og:title", content: "Refund Policy — PumpPilot AI Credits" },
      {
        property: "og:description",
        content:
          "Refund eligibility, unused credit balances and how to request a refund for PumpPilot AI credit purchases.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE_URL}/refund` },
      { name: "twitter:card", content: "summary" },
    ]),
    links: [{ rel: "canonical", href: `${SITE_URL}/refund` }],
    scripts: [
      ldScript(
        legalPageSchema({
          name: "Refund Policy — PumpPilot AI Credits",
          description:
            "Refund eligibility, unused credit balances and how to request a refund for PumpPilot AI credit purchases.",
          path: "/refund",
        }),
      ),
      ldScript(breadcrumbSchema([{ name: "Refund Policy", path: "/refund" }])),
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">Refund Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Subscription cancellations</h2>
            <p className="mt-2">
              You can cancel your subscription at any time through the billing portal. After cancellation,
              you will continue to have access to paid features until the end of your current billing
              period. We do not provide partial refunds for unused time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Refund requests</h2>
            <p className="mt-2">
              If you experience a billing error or believe you are entitled to a refund, contact
              support@pumppilot.ai within 14 days of the charge. We review each request individually.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. No refunds for change of mind</h2>
            <p className="mt-2">
              Because the service is digital and accessible immediately upon subscription, we generally do
              not issue refunds for change of mind. Please use the free tier to evaluate the product
              before upgrading.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Contact</h2>
            <p className="mt-2">For billing questions, email support@pumppilot.ai.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
