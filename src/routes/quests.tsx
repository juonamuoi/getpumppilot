import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { PumpQuestDashboard } from "@/components/pump-quest-dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { canonicalLinks, hreflangLinks } from "@/lib/structured-data";

export const Route = createFileRoute("/quests")({
  head: () => ({
    meta: [
      { title: "PUMP quest dashboard — unlocked, pending & claimable | PumpPilot AI" },
      {
        name: "description",
        content:
          "Track every PumpPilot PUMP quest: which rewards you've unlocked, which are still pending, and exactly when each quest can be claimed.",
      },
      { property: "og:title", content: "PUMP quest dashboard — unlocked, pending & claimable" },
      {
        property: "og:description",
        content:
          "See unlocked, claimable and pending PUMP quests with the action needed to unlock each reward.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [...canonicalLinks("/quests"), ...hreflangLinks("/quests")],
  }),
  component: QuestsPage,
});

function QuestsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Quest dashboard</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every PUMP quest in one place — what you've already unlocked, what's claimable right now,
          and what still needs an action inside the app.
        </p>
        <Button variant="secondary" size="sm" asChild>
          <Link to="/pump">Back to PUMP</Link>
        </Button>
      </header>

      <PumpQuestDashboard />

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm text-amber-200/90">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            PUMP is a loyalty reward with no guaranteed value and no entitlement to profit. Quest
            rewards are not financial advice or an investment product.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
