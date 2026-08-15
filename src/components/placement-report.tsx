import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MousePointerClick } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPlacementReport } from "@/lib/placement-report.functions";

/**
 * Which ad creative (utm_content) and which on-page CTA placement actually
 * produce signups. Rows come back pre-aggregated from the server.
 */
export function PlacementReport({ days }: { days: string }) {
  const fetchReport = useServerFn(getPlacementReport);
  const query = useQuery({
    queryKey: ["placement-report", days],
    queryFn: () => fetchReport({ data: { days: Number(days) } }),
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          clicks: acc.clicks + r.clicks,
          signups: acc.signups + r.signups,
        }),
        { clicks: 0, signups: 0 },
      ),
    [rows],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MousePointerClick className="h-4 w-4 text-primary" />
          Creative × placement conversions
        </CardTitle>
        <CardDescription>
          CTA clicks and attributed signups per ad creative (utm_content), CTA placement,
          source and campaign. {totals.signups} signups from {totals.clicks} tracked clicks.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Creative / placement</th>
              <th className="px-4 py-2 text-left">Campaign</th>
              <th className="px-4 py-2 text-right">Clicks</th>
              <th className="px-4 py-2 text-right">Visitors</th>
              <th className="px-4 py-2 text-right">Signups</th>
              <th className="px-4 py-2 text-right">Signup rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  {query.isLoading
                    ? "Loading…"
                    : "No CTA clicks tracked yet — send UTM-tagged traffic to a landing page."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={`${r.creative}:${r.placement}:${r.source}:${r.campaign}:${r.variant}`}
                className="border-b border-border/40"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{r.creative}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {r.placement}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {r.variant}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.source} / {r.campaign}
                </td>
                <td className="px-4 py-3 text-right">{r.clicks}</td>
                <td className="px-4 py-3 text-right">{r.click_visitors}</td>
                <td className="px-4 py-3 text-right">{r.signups}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  {r.signup_rate === null ? "—" : `${r.signup_rate.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
