import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, ExternalLink, RefreshCw, Trophy } from "lucide-react";
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
import { getLpVariantReport } from "@/lib/lp-report.functions";
import { LANDING_VARIANTS } from "@/lib/landing-variants";
import { useAuth } from "@/lib/auth-store";
import { withSocialMeta } from "@/lib/social-meta";

export const Route = createFileRoute("/lp-report")({
  head: () => ({
    meta: withSocialMeta([
      { title: "Landing Variant Report — PumpPilot AI" },
      {
        name: "description",
        content:
          "Internal dashboard comparing impressions, CTA click-through rate and signup conversion for every PumpPilot AI /lp/ landing variant.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Landing Variant Report — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "Impressions, click-through rate and signup conversion per landing page variant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ]),
  }),
  component: LpReport,
});

function pct(n: number, d: number) {
  if (!d) return 0;
  return (n / d) * 100;
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${w}%` }} />
    </div>
  );
}

function LpReport() {
  const { user, loading } = useAuth();
  const [days, setDays] = useState("30");
  const fetchReport = useServerFn(getLpVariantReport);

  const query = useQuery({
    queryKey: ["lp-variant-report", days],
    queryFn: () => fetchReport({ data: { days: Number(days) } }),
    enabled: !!user,
  });

  const rows = useMemo(() => {
    const meta = new Map(LANDING_VARIANTS.map((v) => [v.slug, v]));
    return (query.data ?? [])
      .filter((r) => meta.has(r.variant))
      .map((r) => {
        const v = meta.get(r.variant)!;
        return {
          ...r,
          audience: v.audience,
          channel: v.channel,
          headline: `${v.headline} ${v.headlineAccent}`,
          ctr: pct(r.cta_clicks, r.impressions),
          signupRate: pct(r.signups, r.cta_clickers),
          conversion: pct(r.signups, r.impressions),
        };
      })
      .sort((a, b) => b.conversion - a.conversion || b.impressions - a.impressions);
  }, [query.data]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          impressions: acc.impressions + r.impressions,
          cta_clicks: acc.cta_clicks + r.cta_clicks,
          cta_clickers: acc.cta_clickers + r.cta_clickers,
          signups: acc.signups + r.signups,
        }),
        { impressions: 0, cta_clicks: 0, cta_clickers: 0, signups: 0 },
      ),
    [rows],
  );

  const maxImpressions = Math.max(1, ...rows.map((r) => r.impressions));
  const best = rows[0];

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Landing variant report</h1>
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
            <BarChart3 className="h-5 w-5 text-emerald-400" /> Landing variant report
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Impressions, “Start free” click-through and signup conversion for every{" "}
            <code className="rounded bg-muted px-1">/lp/*</code> variant.
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
            aria-label="Refresh report"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Totals */}
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Impressions", value: totals.impressions.toLocaleString() },
          { label: "CTA clicks", value: totals.cta_clicks.toLocaleString() },
          { label: "CTA click-through", value: fmtPct(pct(totals.cta_clicks, totals.impressions)) },
          { label: "Signup conversion", value: fmtPct(pct(totals.signups, totals.impressions)) },
        ].map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.label}
              </div>
              <div className="mt-1 text-2xl font-bold">{t.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {best && best.impressions > 0 && (
        <Card className="mt-4 border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <Trophy className="h-4 w-4 text-emerald-400" />
            <span>
              Best converting variant:{" "}
              <span className="font-semibold">/lp/{best.variant}</span> —{" "}
              {fmtPct(best.conversion)} of impressions become signups.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Per-variant performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading report…</div>
          ) : query.error ? (
            <div className="p-6 text-sm text-destructive">
              Could not load the report. {(query.error as Error).message}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No landing variant traffic recorded in this window yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Variant</th>
                    <th className="px-4 py-3 text-right">Impressions</th>
                    <th className="px-4 py-3 text-right">Visitors</th>
                    <th className="px-4 py-3 text-right">CTA clicks</th>
                    <th className="px-4 py-3 text-right">CTR</th>
                    <th className="px-4 py-3 text-right">Signups</th>
                    <th className="px-4 py-3 text-right">Click → signup</th>
                    <th className="px-4 py-3 text-right">Impression → signup</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.variant} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium">
                          /lp/{r.variant}
                          <a
                            href={`/lp/${r.variant}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Open /lp/${r.variant}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                        <div className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground">
                          {r.audience} · {r.channel}
                        </div>
                        <Bar value={r.impressions} max={maxImpressions} />
                      </td>
                      <td className="px-4 py-3 text-right">{r.impressions.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{r.visitors.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{r.cta_clicks.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmtPct(r.ctr)}</td>
                      <td className="px-4 py-3 text-right">{r.signups.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{fmtPct(r.signupRate)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-400">
                        {fmtPct(r.conversion)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        CTR = CTA clicks ÷ impressions. Click → signup uses unique visitors who tapped a “Start
        free” CTA. Attribution is first-touch on the landing variant and its UTM tags.
      </p>
      <div className="mt-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/ads-report">Ad creative A/B report</Link>
        </Button>
      </div>
    </div>
  );
}
