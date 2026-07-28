/**
 * Tiny before/after bar chart for tuning audit log entries.
 * Visualizes how matches and near-miss risk metrics moved on a save.
 */
type Metric = {
  label: string;
  before: number;
  after: number;
  /** true when an increase is a risk increase (bad) */
  higherIsRisk?: boolean;
};

export function TuningDeltaChart({
  matchesBefore,
  matchesAfter,
  nearMissBefore,
  nearMissAfter,
}: {
  matchesBefore?: number;
  matchesAfter?: number;
  nearMissBefore?: number;
  nearMissAfter?: number;
}) {
  const metrics: Metric[] = [];
  if (matchesBefore != null && matchesAfter != null)
    metrics.push({ label: "Matches", before: matchesBefore, after: matchesAfter });
  if (nearMissBefore != null && nearMissAfter != null)
    metrics.push({
      label: "Near-miss",
      before: nearMissBefore,
      after: nearMissAfter,
      higherIsRisk: true,
    });
  if (!metrics.length) return null;

  const max = Math.max(1, ...metrics.flatMap((m) => [m.before, m.after]));
  const W = 92;

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex flex-wrap gap-4">
        {metrics.map((m) => {
          const delta = m.after - m.before;
          const bad = m.higherIsRisk ? delta > 0 : delta < 0;
          const good = delta !== 0 && !bad;
          const afterColor = good
            ? "hsl(var(--success, 142 71% 45%))"
            : bad
              ? "hsl(var(--destructive))"
              : "hsl(var(--muted-foreground))";
          return (
            <div key={m.label} className="min-w-[120px] flex-1">
              <div className="flex items-baseline justify-between text-[9px] text-muted-foreground">
                <span>{m.label}</span>
                <span style={{ color: delta === 0 ? undefined : afterColor }}>
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              </div>
              <svg
                viewBox={`0 0 ${W} 22`}
                className="mt-1 w-full"
                role="img"
                aria-label={`${m.label} before ${m.before}, after ${m.after}`}
              >
                <rect x="0" y="2" width={W} height="7" rx="2" className="fill-muted" />
                <rect
                  x="0"
                  y="2"
                  width={Math.max(1, (m.before / max) * W)}
                  height="7"
                  rx="2"
                  fill="hsl(var(--muted-foreground))"
                  opacity="0.6"
                />
                <rect x="0" y="12" width={W} height="7" rx="2" className="fill-muted" />
                <rect
                  x="0"
                  y="12"
                  width={Math.max(1, (m.after / max) * W)}
                  height="7"
                  rx="2"
                  fill={afterColor}
                />
              </svg>
              <div className="mt-0.5 flex justify-between text-[9px] tabular-nums text-muted-foreground">
                <span>Before {m.before}</span>
                <span>After {m.after}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
