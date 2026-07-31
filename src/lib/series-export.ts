// CSV export of a single holding's price series for the selected horizon,
// so the on-screen sparkline can be verified point by point.

export type SeriesPoint = { ts: number; price: number };

export type SeriesExportMeta = {
  symbol: string;
  name?: string;
  window: string;
  intervalMs: number;
  source: string;
};

const HEADERS = [
  "index",
  "timestamp_iso",
  "timestamp_ms",
  "timestamp_local",
  "price_usd",
  "change_from_previous_pct",
  "change_from_first_pct",
  "symbol",
  "name",
  "horizon",
  "interval_minutes",
  "price_source",
];

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Points must be oldest-first. */
export function seriesToCsv(points: SeriesPoint[], meta: SeriesExportMeta): string {
  const first = points[0]?.price;
  const lines = [HEADERS.join(",")];
  points.forEach((p, i) => {
    const prev = points[i - 1]?.price;
    const fromPrev =
      prev != null && prev !== 0 ? (((p.price - prev) / prev) * 100).toFixed(4) : "";
    const fromFirst =
      first != null && first !== 0 ? (((p.price - first) / first) * 100).toFixed(4) : "";
    lines.push(
      [
        i,
        new Date(p.ts).toISOString(),
        p.ts,
        new Date(p.ts).toLocaleString(),
        p.price,
        fromPrev,
        fromFirst,
        meta.symbol,
        meta.name ?? "",
        meta.window,
        Math.round(meta.intervalMs / 60_000),
        meta.source,
      ]
        .map(esc)
        .join(","),
    );
  });
  return lines.join("\n");
}

export function seriesCsvFilename(meta: SeriesExportMeta, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `pumppilot-${meta.symbol.toLowerCase()}-${meta.window}-series-${stamp}.csv`;
}
