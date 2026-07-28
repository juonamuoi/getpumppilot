import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — PumpPilot AI" },
      {
        name: "description",
        content: "Privacy Policy for PumpPilot AI. We do not store seed phrases or private keys.",
      },
      { property: "og:title", content: "Privacy Policy — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "What PumpPilot AI collects, how wallet scan data is handled, and why we never request seed phrases or private keys.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Information we collect</h2>
            <p className="mt-2">
              We collect the email address you use to sign up, optional profile information, and usage
              data such as feature interactions and simulated trades. We do not collect or store seed
              phrases, private keys or wallet recovery information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. How we use information</h2>
            <p className="mt-2">
              We use your information to provide and improve the service, process subscriptions, secure your
              account, and communicate important updates.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Data sharing</h2>
            <p className="mt-2">
              We do not sell your personal data. We share data only with trusted service providers
              (e.g., payment processing via Stripe) as necessary to operate the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Security</h2>
            <p className="mt-2">
              We use industry-standard security practices, including encrypted connections and secure
              authentication. Wallet connections are read-only and subject to origin checks.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Your rights</h2>
            <p className="mt-2">
              You may update your profile, cancel your subscription, or request deletion of your account
              and data by contacting support@pumppilot.ai.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Changes</h2>
            <p className="mt-2">
              We may update this policy from time to time. We will notify you of material changes via email
              or through the app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
            <p className="mt-2">For privacy questions, email support@pumppilot.ai.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
