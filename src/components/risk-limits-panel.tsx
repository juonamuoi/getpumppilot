import { ShieldCheck, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAsset } from "@/lib/mock-data";
import { markPrice, usePaper } from "@/lib/paper-store";

function usd(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

type Zone = "safe" | "caution" | "warning" | "breach";

/** Utilisation of a cap (0-100+) mapped to a colour-coded severity zone. */
function zoneFor(usedPct: number, breached: boolean): Zone {
  if (breached || usedPct >= 100) return "breach";
  if (usedPct >= 90) return "warning";
  if (usedPct >= 70) return "caution";
  return "safe";
}

const ZONE_STYLES: Record<Zone, { bar: string; track: string; text: string; label: string }> = {
  safe: {
    bar: "bg-safe",
    track: "bg-safe/15",
    text: "text-muted-foreground",
    label: "Within limit",
  },
  caution: {
    bar: "bg-caution",
    track: "bg-caution/15",
    text: "text-caution",
    label: "Approaching limit",
  },
  warning: {
    bar: "bg-warning",
    track: "bg-warning/15",
    text: "text-warning",
    label: "Near limit",
  },
  breach: {
    bar: "bg-destructive",
    track: "bg-destructive/15",
    text: "text-destructive",
    label: "Limit reached",
  },
};

function LimitBar({ usedPct, zone, label }: { usedPct: number; zone: Zone; label: string }) {
  const s = ZONE_STYLES[zone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(100, usedPct))}
      aria-valuetext={`${Math.round(usedPct)}% of limit used — ${s.label}`}
      className={`relative h-2 w-full overflow-hidden rounded-full ${s.track}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${s.bar}`}
        style={{ width: `${Math.max(2, Math.min(100, usedPct))}%` }}
      />
    </div>
  );
}

type Formula = {
  title: string;
  expression: string;
  utilisation: string;
  numbers: string;
  note: string;
};

/** Explains exactly how a metric is derived, with the live numbers plugged in. */
function FormulaTip({ formula, metric }: { formula: Formula; metric: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`How ${metric} is calculated`}
          className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-xs space-y-2 text-left">
        <p className="text-xs font-semibold">{formula.title}</p>
        <p className="rounded bg-muted px-2 py-1 font-mono text-[11px] leading-relaxed">
          {formula.expression}
        </p>
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          {formula.utilisation}
        </p>
        <p className="text-[11px] leading-relaxed">
          <span className="font-medium">Right now: </span>
          {formula.numbers}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{formula.note}</p>
      </TooltipContent>
    </Tooltip>
  );
}




type Props = {
  /** Optional symbol context — adds the remaining headroom for that asset. */
  symbol?: string;
  className?: string;
};

/**
 * Pre-trade risk summary: what you're exposed to right now, today's drawdown,
 * and the exact limits an order is checked against before it fills.
 */
export function RiskLimitsPanel({ symbol, className }: Props) {
  const paper = usePaper();
  const { risk, equity, dayStartEquity, cash, positions } = paper;

  const exposure = positions.reduce((s, p) => {
    const a = getAsset(p.symbol);
    return s + (a ? markPrice(p.symbol, a.price) * p.qty : 0);
  }, 0);
  const exposurePct = equity > 0 ? (exposure / equity) * 100 : 0;

  const drawdownPct =
    dayStartEquity > 0 ? Math.max(0, ((dayStartEquity - equity) / dayStartEquity) * 100) : 0;
  const drawdownBreached = drawdownPct >= risk.maxDailyLossPct;

  const asset = symbol ? getAsset(symbol) : undefined;
  const held = symbol ? positions.find((p) => p.symbol === symbol) : undefined;
  const price = asset ? markPrice(asset.symbol, asset.price) : 0;
  const heldValue = held && asset ? price * held.qty : 0;
  const heldPct = equity > 0 ? (heldValue / equity) * 100 : 0;
  const headroomUsd = Math.max(
    0,
    Math.min((risk.maxPositionPct / 100) * equity - heldValue, cash),
  );
  const headroomQty = price > 0 ? headroomUsd / price : 0;
  const positionBreached = symbol ? heldPct >= risk.maxPositionPct : false;

  const rows = [
    {
      label: "Total exposure",
      value: usd(exposure),
      detail: `${pct(exposurePct)} of ${usd(equity)} equity · ${usd(cash)} cash free`,
      used: exposurePct,
      cap: "100% of equity",
      breached: exposurePct >= 100,
      formula: {
        title: "How total exposure is calculated",
        expression: "exposure = Σ (mark price × quantity) for every open position",
        utilisation: "bar % = exposure ÷ equity × 100",
        numbers: `Σ positions = ${usd(exposure)} · equity = ${usd(equity)} → ${pct(exposurePct)}`,
        note: "Mark price is the latest live price for the symbol, not your entry price, so exposure moves with the market.",
      },
    },
    {
      label: "Today's drawdown",
      value: pct(drawdownPct),
      detail: `Limit ${pct(risk.maxDailyLossPct)} · session start ${usd(dayStartEquity)}`,
      used: (drawdownPct / (risk.maxDailyLossPct || 1)) * 100,
      cap: `${pct(risk.maxDailyLossPct)} daily loss`,
      breached: drawdownBreached,
      formula: {
        title: "How today's drawdown is calculated",
        expression:
          "drawdown % = max(0, (session-start equity − current equity) ÷ session-start equity × 100)",
        utilisation: "bar % = drawdown % ÷ max daily loss % × 100",
        numbers: `(${usd(dayStartEquity)} − ${usd(equity)}) ÷ ${usd(dayStartEquity)} → ${pct(drawdownPct)} of a ${pct(risk.maxDailyLossPct)} limit`,
        note: "Clamped at 0 — a profitable session shows no drawdown. Session-start equity resets each trading day.",
      },
    },
    ...(symbol
      ? [
          {
            label: `${symbol} position`,
            value: pct(heldPct),
            detail: positionBreached
              ? `At or over the ${pct(risk.maxPositionPct)} cap — trim before buying more`
              : `Room for ${headroomQty.toFixed(4)} ${symbol} (${usd(headroomUsd)}) under the ${pct(risk.maxPositionPct)} cap`,
            used: (heldPct / (risk.maxPositionPct || 1)) * 100,
            cap: `${pct(risk.maxPositionPct)} per symbol`,
            breached: positionBreached,
            formula: {
              title: `How ${symbol} headroom is calculated`,
              expression:
                "headroom $ = max(0, min(max position % × equity − position value, free cash))",
              utilisation: "headroom qty = headroom $ ÷ mark price · bar % = position % ÷ max position % × 100",
              numbers: `min(${pct(risk.maxPositionPct)} × ${usd(equity)} − ${usd(heldValue)}, ${usd(cash)}) = ${usd(headroomUsd)} → ${headroomQty.toFixed(4)} ${symbol} at ${usd(price)}`,
              note: "Cash caps headroom: you can never buy more than the settled cash you hold, even if the percentage cap allows it.",
            },
          },
        ]
      : []),
  ].map((r) => ({ ...r, zone: zoneFor(r.used, r.breached) }));


  const worst = rows.reduce<Zone>((acc, r) => {
    const order: Zone[] = ["safe", "caution", "warning", "breach"];
    return order.indexOf(r.zone) > order.indexOf(acc) ? r.zone : acc;
  }, "safe");

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {worst === "safe" ? (
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          ) : (
            <TriangleAlert className={`h-4 w-4 ${ZONE_STYLES[worst].text}`} aria-hidden />
          )}
          Risk limits
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Checked before every order: max {pct(risk.maxPositionPct)} per position, max{" "}
          {pct(risk.maxDailyLossPct)} daily loss, stop {pct(risk.stopLossPct)}, target{" "}
          {pct(risk.takeProfitPct)}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => {
          const s = ZONE_STYLES[r.zone];
          return (
            <div key={r.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{r.label}</span>
                <span className={`font-mono text-sm ${r.zone === "safe" ? "" : s.text}`}>
                  {r.value}
                </span>
              </div>
              <LimitBar
                usedPct={r.used}
                zone={r.zone}
                label={`${r.label} against ${r.cap}`}
              />
              <div className="flex items-start justify-between gap-3">
                <p className={`text-xs ${s.text}`}>{r.detail}</p>
                <span className={`shrink-0 text-[11px] font-medium ${s.text}`}>
                  {s.label} · {Math.round(r.used)}%
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

