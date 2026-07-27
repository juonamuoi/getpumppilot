import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Filter, Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFunnelReport, type FunnelReportRow } from "@/lib/funnel-report.functions";
import { FUNNEL_STEPS } from "@/lib/funnel";

function pct(n: number, d: number) {
  return d ? (n / d) * 100 : 0;
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className="h-2 rounded-full bg-primary"
        style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }}
      />
    </div>
  );
}

export function FunnelReport({ days }: { days: string }) {
  const fetchFunnel = useServerFn(getFunnelReport);
  const query = useQuery({
    queryKey: ["funnel-report", days],
    queryFn: () => fetchFunnel({ data: { days: Number(days) } }),
  });

  const rows = (query.data ?? []) as FunnelReportRow[];

  const totals = useMemo(() => {
    const base = { visitors: 0, cta_clicks: 0, signups: 0, activations: 0 };
    for (const r of rows) {
      base.visitors += r.visitors;
      base.cta_clicks += r.cta_clicks;
      base.signups += r.signups;
      base.activations += r.activations;
    }
    return base;
  }, [rows]);

  const stepTotals: Record<string, number> = {
    visit: totals.visitors,
    cta_click: totals.cta_clicks,
    signup: totals.signups,
    first_chart: totals.activations,
  };

  const avgMinutes = useMemo(() => {
    const withTime = rows.filter((r) => r.avg_minutes_to_chart != null && r.activations > 0);
    if (!withTime.length) return null;
    const weighted = withTime.reduce(
      (acc, r) => acc + (r.avg_minutes_to_chart as number) * r.activations,
      0,
    );
    const n = withTime.reduce((acc, r) => acc + r.activations, 0);
    return weighted / n;
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-primary" /> Signup → first chart funnel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {FUNNEL_STEPS.map((s) => {
              const value = stepTotals[s.step] ?? 0;
              return (
                <div key={s.step} className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className="mt-1 text-2xl font-bold">{value}</div>
                  <div className="mt-2">
                    <Bar value={value} max={totals.visitors} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {pct(value, totals.visitors).toFixed(1)}% of landings · {s.help}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              Avg signup → first chart:{" "}
              <span className="font-medium text-foreground">
                {avgMinutes == null ? "—" : `${avgMinutes.toFixed(1)} min`}
              </span>
            </span>
            <span>
              Signup → activation:{" "}
              <span className="font-medium text-foreground">
                {pct(totals.activations, totals.signups).toFixed(1)}%
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By channel</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Channel</th>
                <th className="px-4 py-2 text-right">Landed</th>
                <th className="px-4 py-2 text-right">CTA</th>
                <th className="px-4 py-2 text-right">Signups</th>
                <th className="px-4 py-2 text-right">Land→signup</th>
                <th className="px-4 py-2 text-right">First chart</th>
                <th className="px-4 py-2 text-right">Signup→chart</th>
                <th className="px-4 py-2 text-right">Avg mins</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    {query.isLoading
                      ? "Loading…"
                      : "No funnel events yet — send tagged traffic (?utm_source=…&utm_medium=…&utm_campaign=…)."}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={`${r.source}:${r.medium}:${r.campaign}:${r.variant}`}
                  className="border-b border-border/40"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.source}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {r.medium}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {r.campaign}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {r.variant}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{r.visitors}</td>
                  <td className="px-4 py-3 text-right">{r.cta_clicks}</td>
                  <td className="px-4 py-3 text-right">{r.signups}</td>
                  <td className="px-4 py-3 text-right">
                    {pct(r.signups, r.visitors).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right">{r.activations}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {pct(r.activations, r.signups).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.avg_minutes_to_chart == null ? "—" : r.avg_minutes_to_chart.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
