import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, BarChart3, RefreshCw } from "lucide-react";
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
import { getCreativeReport } from "@/lib/ad-report.functions";
import { AD_CREATIVES } from "@/lib/ad-creatives";
import { LANDING_VARIANTS } from "@/lib/landing-variants";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/ads-report")({
  head: () => ({
    meta: [
      { title: "Ad Creative A/B Report — PumpPilot AI" },
      {
        name: "description",
        content:
          "Compare landing page ad headlines and descriptions by click-through rate and signup rate across every PumpPilot AI campaign variant.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Ad Creative A/B Report — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "Which ad headline and description produce the highest click-through and signup rates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdsReport,
});

function pct(n: number, d: number) {
  if (!d) return 0;
  return (n / d) * 100;
}

function AdsReport() {
  const { user, loading } = useAuth();
  const [days, setDays] = useState("30");
  const fetchReport = useServerFn(getCreativeReport);

  const query = useQuery({
    queryKey: ["creative-report", days],
    queryFn: () => fetchReport({ data: { days: Number(days) } }),
    enabled: !!user,
  });

  const rows = useMemo(() => {
    const meta = new Map(
      Object.entries(AD_CREATIVES).flatMap(([variant, list]) =>
        list.map((c) => [`${variant}:${c.id}`, c] as const),
      ),
    );
    return (query.data ?? [])
      .map((r) => {
        const c = meta.get(`${r.variant}:${r.creative_id}`);
        return {
          ...r,
          label: c?.label ?? r.creative_id,
          headline: c ? `${c.headline} ${c.headlineAccent}` : r.creative_id,
          description: c?.description ?? "",
          ctr: pct(r.clicks, r.impressions),
          signupRate: pct(r.signups, r.clicks),
          conversion: pct(r.signups, r.impressions),
        };
      })
      .sort((a, b) => b.ctr - a.ctr);
  }, [query.data]);

  const bestCtr = rows[0];
  const bestSignup = useMemo(
    () => [...rows].sort((a, b) => b.conversion - a.conversion)[0],
    [rows],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ad creative A/B report</h1>
          <p className="text-sm text-muted-foreground">
            Landing hero headlines and descriptions, ranked by click-through and signup rate.
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
      </header>

      {!loading && !user && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Sign in to view campaign results.{" "}
            <Link to="/auth" className="text-primary underline">
              Go to sign in
            </Link>
          </CardContent>
        </Card>
      )}

      {user && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Trophy className="h-4 w-4 text-amber-400" /> Best click-through
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bestCtr ? (
                  <>
                    <div className="text-2xl font-bold">{bestCtr.ctr.toFixed(1)}%</div>
                    <p className="mt-1 text-sm">{bestCtr.headline}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {bestCtr.variant} · {bestCtr.label} · {bestCtr.clicks} clicks /{" "}
                      {bestCtr.impressions} views
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart3 className="h-4 w-4 text-emerald-400" /> Best signup rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bestSignup ? (
                  <>
                    <div className="text-2xl font-bold">
                      {bestSignup.conversion.toFixed(1)}%
                    </div>
                    <p className="mt-1 text-sm">{bestSignup.headline}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {bestSignup.variant} · {bestSignup.label} · {bestSignup.signups} signups /{" "}
                      {bestSignup.impressions} views
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">All creatives</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Creative</th>
                    <th className="px-4 py-2 text-right">Views</th>
                    <th className="px-4 py-2 text-right">Clicks</th>
                    <th className="px-4 py-2 text-right">CTR</th>
                    <th className="px-4 py-2 text-right">Signups</th>
                    <th className="px-4 py-2 text-right">Click→signup</th>
                    <th className="px-4 py-2 text-right">View→signup</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                        {query.isLoading
                          ? "Loading…"
                          : "No events recorded yet — send traffic to a /lp/… page."}
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={`${r.variant}:${r.creative_id}`} className="border-b border-border/40">
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.headline}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {r.description}
                        </div>
                        <div className="mt-1 flex gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {r.variant}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {r.creative_id}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{r.impressions}</td>
                      <td className="px-4 py-3 text-right">{r.clicks}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {r.ctr.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right">{r.signups}</td>
                      <td className="px-4 py-3 text-right">{r.signupRate.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {r.conversion.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test URLs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>
                Traffic is split evenly per visitor. To pin an ad to one creative, add{" "}
                <code>?utm_content=&lt;creative id&gt;</code>.
              </p>
              {LANDING_VARIANTS.map((v) => (
                <div key={v.slug}>
                  <span className="font-medium text-foreground">/lp/{v.slug}</span> —{" "}
                  {(AD_CREATIVES[v.slug] ?? []).map((c) => c.id).join(", ")}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
