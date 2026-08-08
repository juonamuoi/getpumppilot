import { withSocialMeta } from "@/lib/social-meta";
import { robotsMetaFor } from "@/lib/indexing-policy";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { LiveWalletPortfolio } from "@/components/live-wallet-portfolio";
import {
  TokenApprovalsPanel,
  ApprovalsExplorerHint,
} from "@/components/token-approvals-panel";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://www.getpumppilot.app/approvals" }],
    meta: withSocialMeta([
      // Wallet-gated app surface: crawlable, but never indexed.
      ...robotsMetaFor("/approvals"),
      { property: "og:url", content: "https://www.getpumppilot.app/approvals" },
      { title: "Wallet Assets & Approval Control — PumpPilot AI" },
      {
        name: "description",
        content:
          "See your connected wallet's assets and every contract approval you signed on other platforms. Cap or revoke any grant from one place.",
      },
      { property: "og:title", content: "Wallet Assets & Approval Control — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "Review live token allowances and collection-wide grants, then overwrite them with a spending cap or a full revoke.",
      },
    ]),
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  return (
    <AppShell>
      <main className="space-y-6 p-4 md:p-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">Assets &amp; approval control</h1>
          <p className="text-sm text-muted-foreground">
            Everything your connected wallet holds, plus every contract grant you have signed
            elsewhere. Cap a spender or revoke it outright — you sign each change in your own wallet.
          </p>
          <ApprovalsExplorerHint />
        </header>

        <DisclaimerBanner />

        <TokenApprovalsPanel />

        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Wallet assets
        </h2>
        <LiveWalletPortfolio />
      </main>
    </AppShell>
  );
}
