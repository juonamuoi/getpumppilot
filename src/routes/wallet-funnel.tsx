import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Wallet, TrendingDown, Timer, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { withSocialMeta } from "@/lib/social-meta";
import { getWalletFunnelReport } from "@/lib/wallet-funnel.functions";
import { WALLET_FUNNEL_STEPS } from "@/lib/funnel";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/wallet-funnel")({
  head: () => ({
    meta: withSocialMeta([
      { title: "Wallet Funnel Analytics — PumpPilot AI" },
      {
        name: "description",
        content:
          "Internal dashboard tracking how many visitors go from starting an in-app wallet to an active, unlocked PumpPilot wallet, with campaign and daily breakdowns.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Wallet Funnel Analytics — PumpPilot AI" },
      {
        property: "og:description",
        content: "Connect-to-active conversion for the PumpPilot in-app wallet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ]),
  }),
  component: WalletFunnelPage,
});

const STEP_LABELS = new Map(WALLET_FUNNEL_STEPS.map((s) => [s.step, s.label]));

/** The ordered conversion path; other steps are shown as lifecycle signals. */
const CONVERSION_PATH = [
  "wallet_create_started",
  "wallet_created",
  "wallet_backup_confirmed",
  "wallet_unlocked",
] as const;

function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : 0;
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

function WalletFunnelPage() {
  const { user, loading } = useAuth();
  const [days, setDays] = useState("30");
  const fetchReport = useServerFn(getWalletFunnelReport);

  const query = useQuery({
    queryKey: ["wallet-funnel-report", days],
    queryFn: () => fetchReport({ data: { days: Number(days) } }),
    enabled: !!user,
  });

  const report = query.data;

  const stepMap = useMemo(
    () => new Map((report?.steps ?? []).map((s) => [s.step, s])),
    [report],
  );

  const funnel = useMemo(() => {
    const top = stepMap.get(CONVERSION_PATH[0])?.visitors ?? 0;
    return CONVERSION_PATH.map((step, i) => {
      const visitors = stepMap.get(step)?.visitors ?? 0;
      const prev = i === 0 ? visitors : stepMap.get(CONVERSION_PATH[i - 1])?.visitors ?? 0;
      return {
        step,
        label: STEP_LABELS.get(step) ?? step,
        visitors,
        ofTop: pct(visitors, top),
        stepRate: i === 0 ? 100 : pct(visitors, prev),
        dropped: i === 0 ? 0 : Math.max(0, prev - visitors),
      };
    });
  }, [stepMap]);

  const maxDaily = Math.max(1, ...(report?.daily ?? []).map((d) => d.started));

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Wallet funnel analytics</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This internal dashboard is only available to signed-in team members.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-2">
            Internal · not indexed
          </Badge>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Wallet className="h-5 w-5 text-emerald-400" /> Wallet funnel
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conversion from starting an in-app wallet to an active, unlocked wallet — measured from
            the <code className="rounded bg-muted px-1">wallet_funnel</code> events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => query.refetch()}
            aria-label="Refresh wallet funnel report"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading report…</p>
      ) : query.error ? (
        <p className="mt-8 text-sm text-destructive">
          Could not load the report. {(query.error as Error).message}
        </p>
      ) : !report ? null : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {[
              {
                label: "Started creation",
                value: (stepMap.get("wallet_create_started")?.visitors ?? 0).toLocaleString(),
                icon: Users,
              },
              {
                label: "Active wallets",
                value: report.active_wallets.toLocaleString(),
                icon: Wallet,
              },
              {
                label: "Start → active",
                value: fmtPct(
                  pct(
                    stepMap.get("wallet_unlocked")?.visitors ?? 0,
                    stepMap.get("wallet_create_started")?.visitors ?? 0,
                  ),
                ),
                icon: TrendingDown,
              },
              {
                label: "Avg time to active",
                value:
                  report.avg_minutes_to_active === null
                    ? "—"
                    : `${report.avg_minutes_to_active} min`,
                icon: Timer,
              },
            ].map((t) => (
              <Card key={t.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    <t.icon className="h-3.5 w-3.5" /> {t.label}
                  </div>
                  <div className="mt-1 text-2xl font-bold">{t.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Funnel */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Connect → active wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {funnel[0].visitors === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No wallet funnel events recorded in this window yet.
                </p>
              ) : (
                funnel.map((s) => (
                  <div key={s.step}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground">
                        {s.visitors.toLocaleString()} visitors · {fmtPct(s.ofTop)} of starts
                        {s.dropped > 0 ? (
                          <span className="ml-2 text-amber-400">
                            −{s.dropped.toLocaleString()} dropped ({fmtPct(100 - s.stepRate)})
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500/70"
                        style={{ width: `${Math.max(1, s.ofTop)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Lifecycle signals */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {["wallet_locked_idle", "wallet_password_rotated", "wallet_removed"].map((step) => (
              <Card key={step}>
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {STEP_LABELS.get(step) ?? step}
                  </div>
                  <div className="mt-1 text-xl font-semibold">
                    {(stepMap.get(step)?.visitors ?? 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {(stepMap.get(step)?.events ?? 0).toLocaleString()} events
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Daily trend */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Daily starts vs. activations</CardTitle>
            </CardHeader>
            <CardContent>
              {report.daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <div className="flex h-40 items-end gap-1">
                  {report.daily.map((d) => (
                    <div
                      key={d.day}
                      className="group relative flex flex-1 flex-col justify-end gap-0.5"
                      title={`${d.day}: ${d.started} started, ${d.created} created, ${d.active} active`}
                    >
                      <div
                        className="w-full rounded-t bg-emerald-500/70"
                        style={{ height: `${(d.active / maxDaily) * 100}%` }}
                      />
                      <div
                        className="w-full rounded-t bg-muted-foreground/30"
                        style={{ height: `${(d.started / maxDaily) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Bottom bar = wallet creations started, top bar = wallets unlocked (active).
              </p>
            </CardContent>
          </Card>

          {/* Attribution */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">By acquisition source</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {report.sources.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No attributed traffic yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left">Source</th>
                        <th className="px-4 py-3 text-left">Campaign</th>
                        <th className="px-4 py-3 text-right">Started</th>
                        <th className="px-4 py-3 text-right">Created</th>
                        <th className="px-4 py-3 text-right">Backed up</th>
                        <th className="px-4 py-3 text-right">Active</th>
                        <th className="px-4 py-3 text-right">Start → active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.sources.map((r) => (
                        <tr key={`${r.source}:${r.campaign}`} className="border-b border-border/40">
                          <td className="px-4 py-3 font-medium">{r.source}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.campaign}</td>
                          <td className="px-4 py-3 text-right">{r.started.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{r.created.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{r.backed_up.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{r.active.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            {fmtPct(pct(r.active, r.started))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
