import { withSocialMeta } from "@/lib/social-meta";
import { breadcrumbSchema, ldScript, webPageSchema } from "@/lib/structured-data";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Handshake, Copy, Check, MousePointerClick, UserPlus, Wallet, Clock } from "lucide-react";
import { toast } from "sonner";

const BASE = "https://www.getpumppilot.app";
const TITLE = "Affiliate program — PumpPilot AI";
const DESCRIPTION =
  "Apply to the PumpPilot AI affiliate program: track clicks, conversions, commission and payouts from one panel. Demo data until your application is approved.";

export const Route = createFileRoute("/affiliate")({
  head: () => ({
    meta: withSocialMeta(
      [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${BASE}/affiliate` },
      ],
      { url: `${BASE}/affiliate` },
    ),
    links: [{ rel: "canonical", href: `${BASE}/affiliate` }],
    scripts: [
      ldScript(webPageSchema({ name: TITLE, description: DESCRIPTION, path: "/affiliate" })),
      ldScript(breadcrumbSchema([{ name: "Affiliate program", path: "/affiliate" }])),
    ],
  }),
  component: AffiliatePage,
});

/** Clearly-labelled demo figures shown until a real affiliate backend exists. */
const DEMO_STATS = {
  clicks: 1_284,
  signups: 96,
  paidConversions: 21,
  commissionCents: 42_350,
  pendingCents: 12_900,
  paidCents: 29_450,
};

const DEMO_PAYOUTS = [
  { id: "PO-2026-06", period: "June 2026", amountCents: 15_200, status: "Paid" },
  { id: "PO-2026-07", period: "July 2026", amountCents: 14_250, status: "Paid" },
  { id: "PO-2026-08", period: "August 2026", amountCents: 12_900, status: "Pending" },
] as const;

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function DemoTag() {
  return (
    <Badge
      variant="outline"
      className="border-amber-500/30 bg-amber-500/10 text-[10px] uppercase tracking-wider text-amber-300"
    >
      Demo
    </Badge>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="border-border/60 bg-card/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-300">{icon}</span>
          <DemoTag />
        </div>
        <div className="mt-3 text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function AffiliatePage() {
  const { user, loading } = useAuth();
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = useMemo(
    () => (user ? `${BASE}/?aff=${user.id.slice(0, 8)}` : ""),
    [user],
  );

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Affiliate link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center text-muted-foreground"
      >
        Loading affiliate panel…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <Handshake className="mx-auto h-12 w-12 text-emerald-400" aria-hidden />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Sign in to apply as an affiliate</h1>
        <p className="mt-2 text-muted-foreground">
          Affiliate links, click tracking and payout history live inside your account.
        </p>
        <Button asChild className="mt-6">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }

  const conversionRate = ((DEMO_STATS.paidConversions / DEMO_STATS.clicks) * 100).toFixed(2);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Handshake className="h-4 w-4 text-emerald-400" aria-hidden />
          <span>Affiliate program</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Earn commission for referred subscriptions
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Share PumpPilot AI with your audience and earn a commission on credit packs bought by
          people you introduce. Earnings depend entirely on the purchases your audience makes —
          there is no guaranteed income.
        </p>

        <Card className="mt-8 border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Application status</CardTitle>
              <CardDescription>
                {applied
                  ? "Under review — we email a decision within 3 business days."
                  : "Not applied yet. Apply to unlock live tracking and payouts."}
              </CardDescription>
            </div>
            {applied ? (
              <Badge className="shrink-0 border border-amber-500/30 bg-amber-500/10 text-amber-300">
                <Clock className="mr-1.5 h-3 w-3" aria-hidden /> Pending review
              </Badge>
            ) : (
              <Button
                onClick={() => {
                  setApplied(true);
                  toast.success("Application submitted for review");
                }}
              >
                Apply now
              </Button>
            )}
          </CardHeader>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Your affiliate link</CardTitle>
            <CardDescription>
              Every visit through this link is attributed to you for 30 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={link} className="font-mono text-sm" aria-label="Affiliate link" />
              <Button onClick={copy} variant="outline" className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="ml-2">{copied ? "Copied" : "Copy link"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <h2 className="mt-10 text-lg font-semibold tracking-tight">Performance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Figures below are sample data shown for layout purposes until your account is approved.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<MousePointerClick className="h-5 w-5" />}
            label="Link clicks"
            value={DEMO_STATS.clicks.toLocaleString()}
          />
          <StatCard
            icon={<UserPlus className="h-5 w-5" />}
            label="Signups"
            value={DEMO_STATS.signups.toLocaleString()}
            hint={`${conversionRate}% click → paid conversion`}
          />
          <StatCard
            icon={<Check className="h-5 w-5" />}
            label="Paid conversions"
            value={DEMO_STATS.paidConversions.toLocaleString()}
          />
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="Commission earned"
            value={usd(DEMO_STATS.commissionCents)}
            hint={`${usd(DEMO_STATS.pendingCents)} pending · ${usd(DEMO_STATS.paidCents)} paid`}
          />
        </div>

        <Card className="mt-8">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Payout history</CardTitle>
              <CardDescription>Payouts run monthly once the balance passes $50.</CardDescription>
            </div>
            <DemoTag />
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Demo affiliate payout history</caption>
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-6 py-3 font-medium">Reference</th>
                    <th scope="col" className="px-6 py-3 font-medium">Period</th>
                    <th scope="col" className="px-6 py-3 font-medium">Amount</th>
                    <th scope="col" className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_PAYOUTS.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-0">
                      <td className="px-6 py-3 font-mono text-xs">{p.id}</td>
                      <td className="px-6 py-3">{p.period}</td>
                      <td className="px-6 py-3 tabular-nums">{usd(p.amountCents)}</td>
                      <td className="px-6 py-3">
                        <Badge
                          variant="outline"
                          className={
                            p.status === "Paid"
                              ? "border-emerald-500/30 text-emerald-300"
                              : "border-amber-500/30 text-amber-300"
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6 border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base text-amber-300">Program terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Commission is paid on credit-pack purchases made by people who arrive through your
              link within the 30-day attribution window. Refunded purchases are clawed back.
            </p>
            <p>
              Self-referrals, paid search on our brand terms, and any claim of guaranteed income,
              returns, or price predictions are not permitted and will void commission.
            </p>
            <p>
              PumpPilot AI is an educational sandbox with demo data. Live execution is locked and
              nothing on the platform is financial advice.
            </p>
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link to="/refer">Referral program</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
