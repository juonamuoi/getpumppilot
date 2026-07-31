// Mobile tap-to-expand drawer: enlarges a holding's sparkline and shows the
// exact timestamp/price of every point in the selected window. The points are
// browsable as a swipeable, snapping carousel.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { PriceSparkline, SparklineStats, fmtPrice } from "@/components/price-sparkline";
import { SPARK_WINDOW_OPTIONS, type SparkWindowValue } from "@/lib/sparkline-window";


type Props = {
  symbol: string;
  name?: string;
  points: number[];
  up: boolean;
  /** Epoch ms of the last point. */
  endTs?: number;
  intervalMs: number;
  window: SparkWindowValue;
  onWindowChange: (v: SparkWindowValue) => void;
  dimmed?: boolean;
  /** Short line explaining where the price came from. */
  sourceNote?: string;
  children: React.ReactNode;
};

function fmtTs(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HoldingSparklineDrawer({
  symbol,
  name,
  points,
  up,
  endTs,
  intervalMs,
  window: win,
  onWindowChange,
  dimmed,
  sourceNote,
  children,
}: Props) {
  const baseTs = endTs ?? Date.now();
  const last = points.length - 1;

  const series = useMemo(
    () =>
      points
        .map((price, i) => ({ price, ts: baseTs - (last - i) * intervalMs, i }))
        .reverse(),
    [points, baseTs, last, intervalMs],
  );

  const change =
    points.length > 1 && points[0] !== 0
      ? ((points[last] - points[0]) / points[0]) * 100
      : 0;

  // --- Swipe + snap carousel over the individual price points ---------------
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Reset to the newest point whenever the window/series changes.
  useEffect(() => {
    setActive(0);
    trackRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [win, points.length]);

  // Track which snapped card is centred while the user swipes.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const node = child as HTMLElement;
      const c = node.offsetLeft + node.offsetWidth / 2;
      const d = Math.abs(c - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActive((prev) => (prev === best ? prev : best));
  }, []);

  const snapTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(i, el.children.length - 1));
    const node = el.children[clamped] as HTMLElement | undefined;
    if (!node) return;
    el.scrollTo({
      left: node.offsetLeft - (el.clientWidth - node.offsetWidth) / 2,
      behavior: "smooth",
    });
    setActive(clamped);
  }, []);

  const activePoint = series[active];
  const prevPoint = series[active + 1]; // series is newest-first
  const stepPct =
    activePoint && prevPoint && prevPoint.price !== 0
      ? ((activePoint.price - prevPoint.price) / prevPoint.price) * 100
      : null;


  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={`Expand ${symbol} ${win} price chart`}
          className="-mx-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-0.5 text-left transition-colors active:bg-muted/40 md:pointer-events-none"
        >
          {children}
        </button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[88vh]">
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="flex items-baseline gap-2">
            <span>{symbol}</span>
            {name && (
              <span className="text-sm font-normal text-muted-foreground">{name}</span>
            )}
          </DrawerTitle>
          <DrawerDescription>
            {points.length} hourly points over the last {win} · read-only price history
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-8">
          <div className="flex overflow-hidden rounded-md border border-border/60 text-xs">
            {SPARK_WINDOW_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onWindowChange(o.value)}
                aria-pressed={win === o.value}
                className={`flex-1 py-1.5 transition-colors ${
                  win === o.value
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/60 p-3">
            <PriceSparkline
              points={points}
              up={up}
              width={320}
              height={120}
              symbol={symbol}
              endTs={endTs}
              intervalMs={intervalMs}
              className={`w-full ${dimmed ? "opacity-50" : ""}`}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <SparklineStats points={points} />
              <span
                className={`font-mono text-xs ${
                  change >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}% over {win}
              </span>
            </div>
          </div>

          <DrawerClose asChild>
            <Link
              to="/asset/$symbol"
              params={{ symbol: symbol.toLowerCase() }}
              search={{ w: win }}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-3 text-sm transition-colors active:bg-muted/40"
            >
              <span>
                Open {symbol} detail page
                <span className="block text-[11px] text-muted-foreground">
                  Full chart on the same {win} horizon
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </DrawerClose>


          {sourceNote && (
            <p className="text-[11px] text-muted-foreground">{sourceNote}</p>
          )}

          <div className="rounded-xl border border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Timestamp</span>
              <span>Price</span>
            </div>
            <ul className="max-h-64 divide-y divide-border/40 overflow-y-auto">
              {series.map((p) => (
                <li
                  key={p.i}
                  className="flex items-center justify-between px-3 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground">{fmtTs(p.ts)}</span>
                  <span className="font-mono">{fmtPrice(p.price)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
