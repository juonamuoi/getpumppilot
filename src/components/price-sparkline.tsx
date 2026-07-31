// Tiny inline 24h price sparkline — pure SVG, no chart library overhead.
type Props = {
  points: number[];
  up?: boolean;
  width?: number;
  height?: number;
  className?: string;
  title?: string;
};

export function PriceSparkline({
  points,
  up = true,
  width = 72,
  height = 22,
  className,
  title,
}: Props) {
  if (!points || points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);

  const line = points.map((v, i) => `${i * stepX},${y(v)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const stroke = up ? "hsl(152 68% 52%)" : "hsl(350 78% 60%)";
  const gradId = `spark-${up ? "up" : "down"}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={title ?? "24h price sparkline"}
    >
      <title>{title ?? "24h price movement"}</title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width} cy={y(points[points.length - 1])} r={1.8} fill={stroke} />
    </svg>
  );
}
