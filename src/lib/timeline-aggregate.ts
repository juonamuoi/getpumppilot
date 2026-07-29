/* ------------------------------------------------------------------ *
 * Timeline aggregation
 *
 * Pure helpers that roll the filtered timeline (risk scan points +
 * mitigation signal points) into:
 *  - total signal delta (matches / near-miss)
 *  - risk-level transition counts (escalation / de-escalation / flat)
 *  - a per-bucket breakdown over time
 * ------------------------------------------------------------------ */

export type AggRiskPoint = {
  ts: number;
  score: number;
  address: string;
  threats: number;
  valueAtRisk: number;
  correlationId?: string;
  trigger?: string;
};

export type AggSignalPoint = {
  ts: number;
  matchDelta: number;
  nearMissDelta: number;
  label?: string;
  rule?: string;
  symbols?: string[];
  correlationId?: string;
  outcome?: string;
};

export const RISK_NAME: Record<number, string> = {
  0: "Safe",
  1: "Medium",
  2: "High",
  3: "Critical",
};

export type Transition = {
  from: number;
  to: number;
  ts: number;
  /** Timestamp of the preceding scan for this wallet (start of the window). */
  prevTs: number;
  address: string;
  direction: "up" | "down";
  correlationId?: string;
  trigger?: string;
};

export type BucketKey = "hour" | "day" | "week";

export const BUCKETS: { key: BucketKey; label: string; ms: number }[] = [
  { key: "hour", label: "Hourly", ms: 3600_000 },
  { key: "day", label: "Daily", ms: 24 * 3600_000 },
  { key: "week", label: "Weekly", ms: 7 * 24 * 3600_000 },
];

export type TimelineBucket = {
  start: number;
  end: number;
  matchDelta: number;
  nearMissDelta: number;
  mitigations: number;
  scans: number;
  escalations: number;
  deEscalations: number;
  peakRisk: number | null;
  endRisk: number | null;
};

export type TimelineAggregate = {
  totalMatchDelta: number;
  totalNearMissDelta: number;
  mitigations: number;
  scans: number;
  netSignalDelta: number;
  escalations: number;
  deEscalations: number;
  unchanged: number;
  transitions: Transition[];
  /** matrix[from][to] = count */
  matrix: number[][];
  startRisk: number | null;
  endRisk: number | null;
  peakRisk: number | null;
  timeAtOrAboveHighMs: number;
  buckets: TimelineBucket[];
};

/**
 * Risk transitions are computed per wallet address so interleaved scans of
 * different wallets never produce phantom escalations.
 */
export function computeTransitions(points: AggRiskPoint[]): {
  transitions: Transition[];
  unchanged: number;
  matrix: number[][];
} {
  const byAddress = new Map<string, AggRiskPoint[]>();
  for (const p of [...points].sort((a, b) => a.ts - b.ts)) {
    const list = byAddress.get(p.address) ?? [];
    list.push(p);
    byAddress.set(p.address, list);
  }

  const matrix = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  const transitions: Transition[] = [];
  let unchanged = 0;

  byAddress.forEach((list, address) => {
    for (let i = 1; i < list.length; i++) {
      const from = list[i - 1].score;
      const to = list[i].score;
      matrix[from][to] += 1;
      if (from === to) {
        unchanged += 1;
        continue;
      }
      transitions.push({
        from,
        to,
        ts: list[i].ts,
        prevTs: list[i - 1].ts,
        address,
        correlationId: list[i].correlationId,
        trigger: list[i].trigger,
        direction: to > from ? "up" : "down",
      });
    }
  });

  transitions.sort((a, b) => a.ts - b.ts);
  return { transitions, unchanged, matrix };
}

function bucketStart(ts: number, ms: number) {
  return Math.floor(ts / ms) * ms;
}

export function aggregateTimeline(
  riskPoints: AggRiskPoint[],
  signalPoints: AggSignalPoint[],
  bucket: BucketKey = "day",
): TimelineAggregate {
  const { transitions, unchanged, matrix } = computeTransitions(riskPoints);

  const totalMatchDelta = signalPoints.reduce((s, p) => s + p.matchDelta, 0);
  const totalNearMissDelta = signalPoints.reduce((s, p) => s + p.nearMissDelta, 0);

  const sortedRisk = [...riskPoints].sort((a, b) => a.ts - b.ts);
  const startRisk = sortedRisk.length ? sortedRisk[0].score : null;
  const endRisk = sortedRisk.length ? sortedRisk[sortedRisk.length - 1].score : null;
  const peakRisk = sortedRisk.length ? Math.max(...sortedRisk.map((p) => p.score)) : null;

  // Rough dwell time at high/critical: span between consecutive scans.
  let timeAtOrAboveHighMs = 0;
  for (let i = 0; i < sortedRisk.length - 1; i++) {
    if (sortedRisk[i].score >= 2) {
      timeAtOrAboveHighMs += sortedRisk[i + 1].ts - sortedRisk[i].ts;
    }
  }

  const ms = BUCKETS.find((b) => b.key === bucket)!.ms;
  const map = new Map<number, TimelineBucket>();
  const ensure = (ts: number) => {
    const start = bucketStart(ts, ms);
    let b = map.get(start);
    if (!b) {
      b = {
        start,
        end: start + ms,
        matchDelta: 0,
        nearMissDelta: 0,
        mitigations: 0,
        scans: 0,
        escalations: 0,
        deEscalations: 0,
        peakRisk: null,
        endRisk: null,
      };
      map.set(start, b);
    }
    return b;
  };

  for (const p of signalPoints) {
    const b = ensure(p.ts);
    b.matchDelta += p.matchDelta;
    b.nearMissDelta += p.nearMissDelta;
    b.mitigations += 1;
  }
  for (const p of sortedRisk) {
    const b = ensure(p.ts);
    b.scans += 1;
    b.peakRisk = b.peakRisk === null ? p.score : Math.max(b.peakRisk, p.score);
    b.endRisk = p.score;
  }
  for (const t of transitions) {
    const b = ensure(t.ts);
    if (t.direction === "up") b.escalations += 1;
    else b.deEscalations += 1;
  }

  const buckets = Array.from(map.values()).sort((a, b) => a.start - b.start);

  return {
    totalMatchDelta,
    totalNearMissDelta,
    mitigations: signalPoints.length,
    scans: riskPoints.length,
    netSignalDelta: totalMatchDelta - totalNearMissDelta,
    escalations: transitions.filter((t) => t.direction === "up").length,
    deEscalations: transitions.filter((t) => t.direction === "down").length,
    unchanged,
    transitions,
    matrix,
    startRisk,
    endRisk,
    peakRisk,
    timeAtOrAboveHighMs,
    buckets,
  };
}

export function formatDuration(ms: number) {
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / 3600_000);
  const m = Math.round((ms % 3600_000) / 60_000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ------------------------------------------------------------------ *
 * Anomaly detection
 *
 * Flags buckets whose total signal delta spikes far away from the
 * typical bucket (robust median + MAD, so a single huge bucket does not
 * hide the rest) and buckets with rapid risk escalation / de-escalation.
 * ------------------------------------------------------------------ */

export type AnomalyKind = "signal-spike" | "escalation-burst" | "deescalation-burst";

export type Anomaly = {
  kind: AnomalyKind;
  /** Bucket window the anomaly was detected in. */
  start: number;
  end: number;
  /** Observed value (net signal delta, or transition count). */
  value: number;
  /** Typical value for comparison (median / threshold). */
  baseline: number;
  /** Robust deviation score; higher = more unusual. */
  score: number;
  severity: "warning" | "critical";
  message: string;
  /** Best correlation ID inside the window, for jumping to the audit entry. */
  correlationId?: string;
  /** Representative timestamp to jump to on the timeline. */
  ts: number;
};

function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function detectAnomalies(
  agg: TimelineAggregate,
  signalPoints: AggSignalPoint[] = [],
  opts: { z?: number; burst?: number } = {},
): Anomaly[] {
  const zLimit = opts.z ?? 3;
  const burstLimit = opts.burst ?? 3;
  const out: Anomaly[] = [];
  const buckets = agg.buckets;
  if (buckets.length < 2) return out;

  const nets = buckets.map((b) => b.matchDelta - b.nearMissDelta);
  const med = median(nets);
  const mad = median(nets.map((v) => Math.abs(v - med))) || 1;

  const idFor = (start: number, end: number) => {
    const inWindow = signalPoints
      .filter((s) => s.ts >= start && s.ts < end && s.correlationId)
      .sort(
        (a, b) =>
          Math.abs(b.matchDelta) + Math.abs(b.nearMissDelta) -
          (Math.abs(a.matchDelta) + Math.abs(a.nearMissDelta)),
      );
    return { correlationId: inWindow[0]?.correlationId, ts: inWindow[0]?.ts };
  };

  buckets.forEach((b, i) => {
    const net = nets[i];
    const score = Math.abs(net - med) / (1.4826 * mad);
    const focus = idFor(b.start, b.end);

    if (score >= zLimit && Math.abs(net) >= 2) {
      out.push({
        kind: "signal-spike",
        start: b.start,
        end: b.end,
        value: net,
        baseline: med,
        score,
        severity: score >= zLimit * 1.8 ? "critical" : "warning",
        message: `Signal delta ${net > 0 ? "surged" : "collapsed"} to ${net > 0 ? "+" : ""}${net} vs a typical ${med > 0 ? "+" : ""}${med}`,
        correlationId: focus.correlationId,
        ts: focus.ts ?? b.start,
      });
    }

    if (b.escalations >= burstLimit) {
      out.push({
        kind: "escalation-burst",
        start: b.start,
        end: b.end,
        value: b.escalations,
        baseline: burstLimit,
        score: b.escalations / burstLimit,
        severity: b.escalations >= burstLimit * 2 ? "critical" : "warning",
        message: `${b.escalations} risk escalations in one window`,
        correlationId: focus.correlationId,
        ts: focus.ts ?? b.start,
      });
    }

    if (b.deEscalations >= burstLimit) {
      out.push({
        kind: "deescalation-burst",
        start: b.start,
        end: b.end,
        value: b.deEscalations,
        baseline: burstLimit,
        score: b.deEscalations / burstLimit,
        severity: "warning",
        message: `${b.deEscalations} rapid de-escalations in one window`,
        correlationId: focus.correlationId,
        ts: focus.ts ?? b.start,
      });
    }
  });

  return out.sort((a, b) => b.score - a.score);
}
