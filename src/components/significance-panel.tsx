import { useMemo, useState } from "react";
import { FlaskConical, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  compareProportions,
  formatP,
  requiredSamplePerArm,
  wilsonInterval,
} from "@/lib/ab-stats";

export type SignificanceRow = {
  key: string;
  label: string;
  variant: string;
  creativeId: string;
  impressions: number;
  clicks: number;
  signups: number;
};

type MetricKey = "ctr" | "click_signup" | "view_signup";

const METRICS: Record<
  MetricKey,
  { label: string; successes: (r: SignificanceRow) => number; trials: (r: SignificanceRow) => number }
> = {
  ctr: { label: "Click-through rate", successes: (r) => r.clicks, trials: (r) => r.impressions },
  click_signup: {
    label: "Click → signup rate",
    successes: (r) => r.signups,
    trials: (r) => r.clicks,
  },
  view_signup: {
    label: "View → signup rate",
    successes: (r) => r.signups,
    trials: (r) => r.impressions,
  },
};

export function SignificancePanel({ rows }: { rows: SignificanceRow[] }) {
  const [metric, setMetric] = useState<MetricKey>("ctr");
  const [level, setLevel] = useState("95");

  const conf = Number(level);
  const m = METRICS[metric];

  const analysis = useMemo(() => {
    const usable = rows
      .map((r) => {
        const successes = m.successes(r);
        const trials = m.trials(r);
        return {
          row: r,
          successes,
          trials,
          rate: trials ? (successes / trials) * 100 : 0,
          ci: wilsonInterval(successes, trials, conf),
        };
      })
      .filter((r) => r.trials > 0)
      .sort((a, b) => b.rate - a.rate);

    if (usable.length === 0) return null;
    const leader = usable[0];
    const challengers = usable.slice(1).map((c) => ({
      ...c,
      test: compareProportions(leader.successes, leader.trials, c.successes, c.trials, conf),
      needed: requiredSamplePerArm(
        c.trials ? c.successes / c.trials : 0,
        Math.abs(leader.rate - c.rate) / 100,
        conf,
      ),
    }));
    const decisive =
      challengers.length > 0 && challengers.every((c) => c.test?.significant);
    return { leader, challengers, decisive };
  }, [rows, m, conf]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-primary" /> Statistical significance
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger className="w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(METRICS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="90">90% conf.</SelectItem>
              <SelectItem value="95">95% conf.</SelectItem>
              <SelectItem value="99">99% conf.</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!analysis && (
          <p className="text-sm text-muted-foreground">
            Not enough events yet to test this metric.
          </p>
        )}

        {analysis && (
          <>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={analysis.decisive ? "default" : "secondary"}>
                  {analysis.decisive ? "Winner confirmed" : "No confirmed winner yet"}
                </Badge>
                <span className="text-sm font-medium">{analysis.leader.row.label}</span>
                <Badge variant="outline" className="text-[10px]">
                  {analysis.leader.row.variant}
                </Badge>
              </div>
              <div className="mt-2 text-2xl font-bold">
                {analysis.leader.rate.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {conf}% CI {analysis.leader.ci.low.toFixed(2)}% –{" "}
                {analysis.leader.ci.high.toFixed(2)}% · {analysis.leader.successes} /{" "}
                {analysis.leader.trials}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {analysis.decisive
                  ? `Leads every other creative at ${conf}% confidence — safe to scale spend behind it.`
                  : "Overlapping intervals mean the lead could be noise. Keep the test running before shifting budget."}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Vs. leader</th>
                    <th className="px-3 py-2 text-right">Rate ({conf}% CI)</th>
                    <th className="px-3 py-2 text-right">Lift (pp)</th>
                    <th className="px-3 py-2 text-right">Diff CI</th>
                    <th className="px-3 py-2 text-right">Significance</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.challengers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                        Only one creative has traffic for this metric.
                      </td>
                    </tr>
                  )}
                  {analysis.challengers.map((c) => (
                    <tr key={c.row.key} className="border-b border-border/40 align-top">
                      <td className="px-3 py-3">
                        <div className="font-medium">{c.row.label}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {c.row.variant} · {c.row.creativeId} · {c.successes} / {c.trials}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold">{c.rate.toFixed(2)}%</div>
                        <div className="text-xs text-muted-foreground">
                          {c.ci.low.toFixed(2)} – {c.ci.high.toFixed(2)}%
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-400">
                        +{(c.test?.liftPp ?? 0).toFixed(2)}
                        <div className="text-xs font-normal text-muted-foreground">
                          {(c.test?.liftRelative ?? 0).toFixed(1)}% rel.
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-muted-foreground">
                        {c.test
                          ? `${c.test.diffInterval.low.toFixed(2)} – ${c.test.diffInterval.high.toFixed(2)} pp`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {c.test ? (
                          <>
                            <Badge
                              variant={c.test.significant ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {c.test.significant ? "Significant" : "Not significant"}
                            </Badge>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatP(c.test.pValue)} · z = {c.test.zScore.toFixed(2)}
                            </div>
                            {c.test.underpowered && (
                              <div className="text-[10px] text-amber-400">Low sample</div>
                            )}
                            {!c.test.significant && c.needed && (
                              <div className="text-[10px] text-muted-foreground">
                                ~{c.needed.toLocaleString()} per arm needed
                              </div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Rate intervals use the Wilson score method; comparisons use a two-sided pooled
              two-proportion z-test at {conf}% confidence with 80%-power sample estimates. Results
              are probabilistic — peeking at a test repeatedly inflates false positives, so let each
              arm accumulate traffic before deciding.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
