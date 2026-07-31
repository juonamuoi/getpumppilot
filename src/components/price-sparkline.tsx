// Tiny inline 24h price sparkline — pure SVG, no chart library overhead.
// Supports hover tooltips showing the timestamp + price of the nearest point.
import { useMemo, useRef, useState } from "react";

type Props = {
  points: number[];
  up?: boolean;
  width?: number;
  height?: number;
  className?: string;
  title?: string;
  /** Epoch ms of the LAST point (defaults to now). */
  endTs?: number;
  /** Spacing between points in ms (defaults to hourly). */
  intervalMs?: number;
  /** Symbol shown in the tooltip header. */
  symbol?: string;
};

function fmtPrice(v: number) {
  const digits = v >= 1000 ? 2 : v >= 1 ? 4 : 6;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

export function PriceSparkline({
  points,
  up = true,
  width = 72,
  height = 22,
  className,
  title,
  endTs,
  intervalMs = 3_600_000,
  symbol,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const stepX = width / (points.length - 1);
    const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
    const line = points.map((v, i) => `${i * stepX},${y(v)}`).join(" ");
    return { stepX, y, line, area: `0,${height} ${line} ${width},${height}` };
  }, [points, width, height]);

  if (!geom) return null;

  const stroke = up ? "hsl(152 68% 52%)" : "hsl(350 78% 60%)";
  const gradId = `spark-${up ? "up" : "down"}`;
  const last = points.length - 1;
  const baseTs = endTs ?? Date.now();
  const tsAt = (i: number) => baseTs - (last - i) * intervalMs;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.max(0, Math.min(last, Math.round(x / geom.stepX)));
    setHover(idx);
  };

  const hx = hover != null ? hover * geom.stepX : 0;
  const hy = hover != null ? geom.y(points[hover]) : 0;

  return (
    <span className="relative inline-flex">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        role="img"
        aria-label={title ?? "24h price sparkline"}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <title>{title ?? "24h price movement"}</title>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <polygon points={geom.area} fill={`url(#${gradId})`} />
        <polyline
          points={geom.line}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={width} cy={geom.y(points[last])} r={1.8} fill={stroke} />
        {hover != null && (
          <>
            <line
              x1={hx}
              y1={0}
              x2={hx}
              y2={height}
              stroke="currentColor"
              strokeWidth={0.75}
              className="text-muted-foreground/60"
            />
            <circle cx={hx} cy={hy} r={2.2} fill={stroke} stroke="hsl(var(--background))" strokeWidth={0.8} />
          </>
        )}
      </svg>

      {hover != null && (
        <span
          className="pointer-events-none absolute bottom-full z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] leading-tight text-popover-foreground shadow-md"
          style={{ left: `${(hover / last) * 100}%` }}
        >
          <span className="block font-mono font-semibold">{fmtPrice(points[hover])}</span>
          <span className="block text-muted-foreground">
            {symbol ? `${symbol} · ` : ""}
            {new Date(tsAt(hover)).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </span>
      )}
    </span>
  );
}
