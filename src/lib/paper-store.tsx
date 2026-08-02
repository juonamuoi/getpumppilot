import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ASSETS, getAsset } from "./mock-data";
import { livePriceOf } from "./live-price-registry";
import { getLiveTrading } from "./live-trading";
import { describeRiskBlock, type RiskBlock } from "./risk-block";


/** Live price when the feed covers the symbol, else the simulated demo price. */
function markPrice(symbol: string, fallback: number): number {
  return livePriceOf(symbol) ?? fallback;
}

export type Position = {
  symbol: string;
  qty: number;
  avgCost: number;
};

export type Trade = {
  id: string;
  ts: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
};

export type Alert = {
  id: string;
  symbol: string;
  kind: "price-above" | "price-below" | "momentum-above";
  value: number;
  active: boolean;
};

export type ScannerRules = {
  minMomentum: number;
  minVolumeScore: number;
  maxVolatility: number;
  min24hChangePct: number;
  includeMajors: boolean;
  includeDemoSmallCaps: boolean;
  channels: {
    inApp: boolean;
    email: boolean;
    push: boolean;
  };
  cooldownMinutes: number;
};

export type AlertDelivery = {
  id: string;
  ts: number;
  symbol: string;
  rule: string; // human-readable rule description
  channel: "in-app" | "email" | "push";
  status: "delivered" | "muted" | "failed";
  detail: string;
  /** Set when the delivery was produced by a mitigation outcome check. */
  correlationId?: string;
};

/** Alert outcome observed right after a mitigation was applied. */
export type MitigationOutcome = {
  ts: number;
  correlationId: string;
  /** Number of assets matching the rules after the change. */
  matched: number;
  /** Alert deliveries actually created (0 when every channel is muted). */
  delivered: number;
  symbols: string[];
  channels: string[];
  status: "alerts-fired" | "no-matches" | "channels-muted";
};


/** One applied rule-tuning change, kept for auditability. */
export type TuningLogEntry = {
  id: string;
  /** Where the change came from. */
  source?: "manual-save" | "recommendation" | "auto" | "mitigation";
  /** Rule threshold change, or a risk-bounds (tolerance/limit) change. */
  kind?: "rule" | "bounds";
  /** One-tap mitigation label, e.g. "Tighten filter" or "Raise fragility tolerance". */
  mitigation?: string;
  /** Risk deltas that triggered the recommendation this mitigation replaced. */
  trigger?: string;
  /** The originally recommended value the mitigation replaced. */
  recommendedValue?: number;
  /** Fragility of the applied option, in percent. */
  fragilePct?: number;
  ts: number;


  /** Rule key: momentum | volume | volatility | change */
  rule: string;
  /** Human label, e.g. "Momentum". */
  ruleLabel: string;
  operator: ">=" | "<=";
  unit: string;
  oldValue: number;
  newValue: number;
  /** Preset used when the recommendation was generated. */
  preset: string;
  /** Replay window the recommendation came from, e.g. "24h". */
  window?: string;
  /** Asset scope the rules covered at apply time. */
  scope?: "majors" | "demo" | "both" | "none";

  /** Expected match count before/after, from the preview at apply time. */
  matchesBefore?: number;
  matchesAfter?: number;
  nearMissBefore?: number;
  nearMissAfter?: number;

  /** "preview" = reviewed in the confirm dialog only; "applied" = saved to the rules. */
  phase?: "preview" | "applied";
  /** For applied entries: the id of the preview entry that was reviewed first. */
  previewId?: string;
  /** Timestamp the preview was generated / the change was applied. */
  previewedAt?: number;
  appliedAt?: number;
  /** Scope-wide (portfolio) metrics captured from the preview panel. */
  scopeMatchesBefore?: number;
  scopeMatchesAfter?: number;
  scopeNearMissBefore?: number;
  scopeNearMissAfter?: number;
  scopeAssetsAffected?: number;

  /** Stable id linking a mitigation preview, its applied entry and the alert outcome. */
  correlationId?: string;
  /** Set on replayed entries: the correlation id of the mitigation that was re-run. */
  replayOf?: string;
  /** Alert outcome recorded after the mitigation took effect. */
  outcome?: MitigationOutcome;

  /** Set once this change has been rolled back. */

  revertedAt?: number;
  /** Optional user-entered reason captured at rollback time. */
  revertReason?: string;
};

/** How long mitigation audit history is kept, and what gets exported. */
export type AuditRetention = {
  /** Days to keep "preview only" entries. 0 = keep forever. */
  previewDays: number;
  /** Days to keep applied entries (incl. undo/replay). 0 = keep forever. */
  appliedDays: number;
  /** Hard cap on stored entries (newest kept). */
  maxEntries: number;
  /** Include preview-only entries in audit exports. */
  includePreviewsInExport: boolean;
};

export const DEFAULT_RETENTION: AuditRetention = {
  previewDays: 30,
  appliedDays: 180,
  maxEntries: 200,
  includePreviewsInExport: true,
};

const DAY_MS = 86_400_000;

/** Applies a retention policy to a tuning log (newest-first). Pure. */
export function applyRetention(log: TuningLogEntry[], r: AuditRetention, now = Date.now()) {
  return log
    .filter((e) => {
      const days = (e.phase === "preview" ? r.previewDays : r.appliedDays) || 0;
      if (days <= 0) return true;
      return now - e.ts <= days * DAY_MS;
    })
    .slice(0, Math.max(1, r.maxEntries));
}

type State = {
  cash: number;
  positions: Position[];
  trades: Trade[];
  alerts: Alert[];
  scannerRules: ScannerRules;
  deliveries: AlertDelivery[];
  tuningLog: TuningLogEntry[];
  liveExecutionEnabled: boolean; // mirrors the opt-in live-trading switch
  masterSwitchLocked: boolean;
  risk: {
    maxPositionPct: number;
    maxDailyLossPct: number;
    stopLossPct: number;
    takeProfitPct: number;
  };
  trade: (
    symbol: string,
    side: "buy" | "sell",
    qty: number,
  ) => { ok: boolean; msg: string; block?: RiskBlock };

  addAlert: (a: Omit<Alert, "id" | "active"> & { active?: boolean }) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  setScannerRules: (r: ScannerRules) => void;
  logTuning: (e: Omit<TuningLogEntry, "id" | "ts">) => string;
  markTuningReverted: (id: string, reason?: string) => void;
  /** Evaluate alert outcome for a mitigation and attach it to every entry sharing the correlation id. */
  recordMitigationOutcome: (correlationId: string, rules?: ScannerRules) => MitigationOutcome;
  /** The most recent applied, not-yet-reverted mitigation batch (entries share a correlation id). */
  lastMitigation: { correlationId: string; ts: number; label: string; entries: TuningLogEntry[] } | null;
  /** One-click revert of the last applied mitigation. Returns the restored batch, or null. */
  undoLastMitigation: (reason?: string) => { correlationId: string; label: string; entries: TuningLogEntry[] } | null;
  /**
   * One-click replay: re-run a recorded mitigation with the exact same parameters,
   * reusing its stored preview context. Returns the new batch, or null when the
   * correlation id has no replayable rule entries.
   */
  replayMitigation: (
    correlationId: string,
  ) => { correlationId: string; label: string; entries: TuningLogEntry[]; outcome: MitigationOutcome } | null;
  clearTuningLog: () => void;
  /** Retention policy for mitigation audit history. */
  retention: AuditRetention;
  setRetention: (r: AuditRetention) => void;
  /** Immediately drop entries outside the policy. Returns how many were removed. */
  purgeAuditHistory: (r?: AuditRetention) => number;
  /** Entries currently outside the policy (i.e. what a purge would remove). */
  expiredAuditCount: number;


  simulateScannerRun: () => number; // returns count of new deliveries
  /** Append externally-generated deliveries (e.g. the realtime momentum engine). */
  pushDeliveries: (d: AlertDelivery[]) => void;
  clearDeliveries: () => void;

  setRisk: (r: State["risk"]) => void;
  resetPaper: () => void;
  equity: number;
};


const STARTING_CASH = 100_000;

/** Human-readable correlation id shared by a mitigation preview, apply and outcome. */
export function newCorrelationId(prefix = "MIT") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** Writes a rule key's threshold onto a ruleset (mutates), keeping its fixed operator. */
export function applyRuleValue(rules: ScannerRules, key: string, value: number) {
  if (key === "momentum") rules.minMomentum = value;
  else if (key === "volume") rules.minVolumeScore = value;
  else if (key === "volatility") rules.maxVolatility = value;
  else if (key === "change") rules.min24hChangePct = value;
}

/** Newest applied, not-yet-reverted mitigation batch, grouped by correlation id. */
export function findLastMitigation(log: TuningLogEntry[]) {
  const head = log.find(
    (e) =>
      e.source === "mitigation" &&
      e.kind === "rule" &&
      e.rule !== "undo" &&
      e.phase !== "preview" &&
      !e.revertedAt,
  );
  if (!head) return null;
  const cid = head.correlationId ?? head.id;
  const entries = log.filter(
    (e) =>
      (e.correlationId ?? e.id) === cid &&
      e.kind === "rule" &&
      e.rule !== "undo" &&
      e.phase !== "preview" &&
      !e.revertedAt,
  );
  return {
    correlationId: cid,
    ts: head.ts,
    label: head.mitigation ?? "Mitigation",
    entries,
  };
}

const TUNING_LOG_KEY = "pumppilot_tuning_log";
const RETENTION_KEY = "pumppilot_audit_retention";

const Ctx = createContext<State | null>(null);

export function PaperProvider({ children }: { children: ReactNode }) {
  const [cash, setCash] = useState(STARTING_CASH);
  const [positions, setPositions] = useState<Position[]>([
    { symbol: "BTC", qty: 0.35, avgCost: 62000 },
    { symbol: "SOL", qty: 42, avgCost: 148 },
    { symbol: "NOVA", qty: 4200, avgCost: 0.98 },
  ]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([
    { id: "a1", symbol: "BTC", kind: "price-above", value: 72000, active: true },
    { id: "a2", symbol: "SOL", kind: "momentum-above", value: 85, active: true },
  ]);
  const [risk, setRisk] = useState({
    maxPositionPct: 25,
    maxDailyLossPct: 5,
    stopLossPct: 8,
    takeProfitPct: 20,
  });
  const [scannerRules, setScannerRules] = useState<ScannerRules>({
    minMomentum: 75,
    minVolumeScore: 60,
    maxVolatility: 85,
    min24hChangePct: 3,
    includeMajors: true,
    includeDemoSmallCaps: true,
    channels: { inApp: true, email: false, push: true },
    cooldownMinutes: 30,
  });

  const [tuningLog, setTuningLog] = useState<TuningLogEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(TUNING_LOG_KEY);
      return raw ? (JSON.parse(raw) as TuningLogEntry[]) : [];
    } catch {
      return [];
    }
  });

  const [retention, setRetentionState] = useState<AuditRetention>(() => {
    if (typeof window === "undefined") return DEFAULT_RETENTION;
    try {
      const raw = window.localStorage.getItem(RETENTION_KEY);
      return raw
        ? { ...DEFAULT_RETENTION, ...(JSON.parse(raw) as Partial<AuditRetention>) }
        : DEFAULT_RETENTION;
    } catch {
      return DEFAULT_RETENTION;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RETENTION_KEY, JSON.stringify(retention));
    } catch {}
  }, [retention]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        TUNING_LOG_KEY,
        JSON.stringify(applyRetention(tuningLog, retention)),
      );
    } catch {}
  }, [tuningLog, retention]);

  // Prune on mount and whenever the policy changes.
  useEffect(() => {
    setTuningLog((prev) => {
      const next = applyRetention(prev, retention);
      return next.length === prev.length ? prev : next;
    });
  }, [retention]);

  const now = Date.now();
  const [deliveries, setDeliveries] = useState<AlertDelivery[]>([
    {
      id: "d1",
      ts: now - 1000 * 60 * 8,
      symbol: "SOL",
      rule: "Momentum ≥ 80",
      channel: "in-app",
      status: "delivered",
      detail: "SOL momentum 84 crossed threshold",
    },
    {
      id: "d2",
      ts: now - 1000 * 60 * 42,
      symbol: "DEMOX",
      rule: "24h change ≥ 15%",
      channel: "push",
      status: "delivered",
      detail: "DEMOX +22.4% on rising volume",
    },
    {
      id: "d3",
      ts: now - 1000 * 60 * 95,
      symbol: "BTC",
      rule: "Price above $70,000",
      channel: "email",
      status: "muted",
      detail: "Suppressed by 30m cooldown",
    },
    {
      id: "d4",
      ts: now - 1000 * 60 * 60 * 4,
      symbol: "ORBIT",
      rule: "Momentum ≥ 75",
      channel: "in-app",
      status: "delivered",
      detail: "ORBIT momentum 81 breakout confirmed",
    },
    {
      id: "d5",
      ts: now - 1000 * 60 * 60 * 22,
      symbol: "PILOT",
      rule: "Momentum ≥ 75",
      channel: "push",
      status: "failed",
      detail: "Simulated push delivery error",
    },
  ]);


  const equity = useMemo(() => {
    const posValue = positions.reduce((s, p) => {
      const a = getAsset(p.symbol);
      return s + (a ? markPrice(p.symbol, a.price) * p.qty : 0);
    }, 0);
    return cash + posValue;
  }, [cash, positions]);

  const trade: State["trade"] = (symbol, side, qty) => {
    const a = getAsset(symbol);
    if (!a) return { ok: false, msg: "Unknown symbol" };
    if (qty <= 0) return { ok: false, msg: "Quantity must be positive" };
    // Fill at the same live-overlaid mark every screen displays.
    const price = markPrice(symbol, a.price);
    const notional = price * qty;

    if (side === "buy") {
      if (notional > cash) return { ok: false, msg: "Insufficient paper cash" };
      const posPct = (notional / equity) * 100;
      if (posPct > risk.maxPositionPct)
        return { ok: false, msg: `Blocked by risk control: position > ${risk.maxPositionPct}% of equity` };
      setCash((c) => c - notional);
      setPositions((prev) => {
        const ex = prev.find((p) => p.symbol === symbol);
        if (ex) {
          const totalQty = ex.qty + qty;
          const avgCost = (ex.avgCost * ex.qty + price * qty) / totalQty;
          return prev.map((p) => (p.symbol === symbol ? { ...p, qty: totalQty, avgCost } : p));
        }
        return [...prev, { symbol, qty, avgCost: price }];
      });
    } else {
      const ex = positions.find((p) => p.symbol === symbol);
      if (!ex || ex.qty < qty) return { ok: false, msg: "Insufficient position" };
      setCash((c) => c + notional);
      setPositions((prev) =>
        prev
          .map((p) => (p.symbol === symbol ? { ...p, qty: p.qty - qty } : p))
          .filter((p) => p.qty > 0.0000001),
      );
    }

    setTrades((t) => [
      { id: Math.random().toString(36).slice(2), ts: Date.now(), symbol, side, qty, price },
      ...t,
    ]);
    return { ok: true, msg: `Paper ${side.toUpperCase()} ${qty} ${symbol} @ ${price}` };
  };

  const simulateScannerRun = () => {
    const channels: AlertDelivery["channel"][] = [];
    if (scannerRules.channels.inApp) channels.push("in-app");
    if (scannerRules.channels.email) channels.push("email");
    if (scannerRules.channels.push) channels.push("push");
    if (channels.length === 0) return 0;

    const matches = ASSETS.filter((a) => {
      if (!scannerRules.includeMajors && a.category === "major") return false;
      if (!scannerRules.includeDemoSmallCaps && a.category === "demo-smallcap") return false;
      return (
        a.momentum.total >= scannerRules.minMomentum &&
        a.momentum.volume >= scannerRules.minVolumeScore &&
        a.momentum.volatility <= scannerRules.maxVolatility &&
        a.change24h >= scannerRules.min24hChangePct
      );
    });

    const ts = Date.now();
    const created: AlertDelivery[] = matches.map((a, i) => ({
      id: `${ts}-${a.symbol}-${i}`,
      ts,
      symbol: a.symbol,
      rule: `Momentum ≥ ${scannerRules.minMomentum} · Vol ≥ ${scannerRules.minVolumeScore} · 24h ≥ ${scannerRules.min24hChangePct}%`,
      channel: channels[i % channels.length],
      status: "delivered",
      detail: `${a.symbol} momentum ${a.momentum.total}, 24h ${a.change24h >= 0 ? "+" : ""}${a.change24h.toFixed(2)}%`,
    }));

    if (created.length > 0) setDeliveries((prev) => [...created, ...prev]);
    return created.length;
  };

  const lastMitigationBatch = findLastMitigation(tuningLog);

  const value: State = {

    cash,
    positions,
    trades,
    alerts,
    scannerRules,
    deliveries,
    tuningLog,
    liveExecutionEnabled: getLiveTrading().mode === "live",
    masterSwitchLocked: true,
    risk,
    trade,
    addAlert: (a) =>
      setAlerts((prev) => [
        ...prev,
        { id: Math.random().toString(36).slice(2), active: true, ...a },
      ]),
    removeAlert: (id) => setAlerts((prev) => prev.filter((x) => x.id !== id)),
    toggleAlert: (id) =>
      setAlerts((prev) => prev.map((x) => (x.id === id ? { ...x, active: !x.active } : x))),
    setScannerRules,
    logTuning: (e) => {
      const id = Math.random().toString(36).slice(2);
      setTuningLog((prev) =>
        [
          { correlationId: e.correlationId ?? newCorrelationId(), ...e, id, ts: Date.now() },
          ...prev,
        ].slice(0, 200),
      );
      return id;
    },
    recordMitigationOutcome: (correlationId, rulesOverride) => {
      const rules = rulesOverride ?? scannerRules;
      const channels: AlertDelivery["channel"][] = [];
      if (rules.channels.inApp) channels.push("in-app");
      if (rules.channels.email) channels.push("email");
      if (rules.channels.push) channels.push("push");

      const matches = ASSETS.filter((a) => {
        if (!rules.includeMajors && a.category === "major") return false;
        if (!rules.includeDemoSmallCaps && a.category === "demo-smallcap") return false;
        return (
          a.momentum.total >= rules.minMomentum &&
          a.momentum.volume >= rules.minVolumeScore &&
          a.momentum.volatility <= rules.maxVolatility &&
          a.change24h >= rules.min24hChangePct
        );
      });

      const ts = Date.now();
      const created: AlertDelivery[] =
        channels.length === 0
          ? []
          : matches.map((a, i) => ({
              id: `${ts}-${a.symbol}-${i}-${correlationId}`,
              ts,
              symbol: a.symbol,
              rule: `Mitigation check · Momentum ≥ ${rules.minMomentum} · Vol ≥ ${rules.minVolumeScore} · 24h ≥ ${rules.min24hChangePct}%`,
              channel: channels[i % channels.length],
              status: "delivered" as const,
              detail: `${a.symbol} momentum ${a.momentum.total}, 24h ${a.change24h >= 0 ? "+" : ""}${a.change24h.toFixed(2)}% (${correlationId})`,
              correlationId,
            }));

      if (created.length > 0) setDeliveries((prev) => [...created, ...prev]);

      const outcome: MitigationOutcome = {
        ts,
        correlationId,
        matched: matches.length,
        delivered: created.length,
        symbols: matches.map((a) => a.symbol),
        channels,
        status:
          channels.length === 0
            ? "channels-muted"
            : matches.length === 0
              ? "no-matches"
              : "alerts-fired",
      };

      setTuningLog((prev) =>
        prev.map((e) => (e.correlationId === correlationId ? { ...e, outcome } : e)),
      );
      return outcome;
    },

    markTuningReverted: (id, reason) =>
      setTuningLog((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, revertedAt: Date.now(), ...(reason ? { revertReason: reason } : {}) }
            : e,
        ),
      ),
    lastMitigation: lastMitigationBatch,
    undoLastMitigation: (reason) => {
      const batch = lastMitigationBatch;
      if (!batch) return null;
      const restored = { ...scannerRules };
      for (const e of batch.entries) applyRuleValue(restored, e.rule, e.oldValue);
      setScannerRules(restored);
      const at = Date.now();
      const ids = new Set(batch.entries.map((e) => e.id));
      const undoId = Math.random().toString(36).slice(2);
      const detail = batch.entries
        .map((e) => `${e.ruleLabel} ${e.newValue}${e.unit} → ${e.oldValue}${e.unit}`)
        .join(", ");
      setTuningLog((prev) =>
        [
          {
            id: undoId,
            ts: at,
            correlationId: batch.correlationId,
            source: "mitigation" as const,
            kind: "rule" as const,
            phase: "applied" as const,
            mitigation: `Undo: ${batch.label}`,
            trigger: reason
              ? `One-click undo — ${reason}`
              : "One-click undo of the last mitigation",
            rule: "undo",
            ruleLabel: "Undo mitigation",
            operator: ">=" as const,
            unit: "",
            oldValue: 0,
            newValue: 0,
            preset: "undo",
            appliedAt: at,
            revertReason: reason,
          },
          ...prev.map((e) =>
            ids.has(e.id)
              ? { ...e, revertedAt: at, ...(reason ? { revertReason: reason } : {}) }
              : e,
          ),
        ].slice(0, 200),
      );
      return { correlationId: batch.correlationId, label: batch.label, entries: batch.entries };
    },
    replayMitigation: (correlationId) => {
      // Source of truth = the stored audit entries for this correlation id.
      const source = tuningLog.filter(
        (e) =>
          e.correlationId === correlationId &&
          e.source === "mitigation" &&
          e.kind === "rule" &&
          e.rule !== "undo",
      );
      // Prefer the applied entries; fall back to the preview context when the
      // mitigation was only ever reviewed.
      const applied = source.filter((e) => e.phase !== "preview");
      const batch = applied.length > 0 ? applied : source;
      if (batch.length === 0) return null;

      const label = batch[0].mitigation ?? "Mitigation";
      const nextRules = { ...scannerRules };
      for (const e of batch) applyRuleValue(nextRules, e.rule, e.newValue);
      setScannerRules(nextRules);

      const at = Date.now();
      const replayId = `${correlationId}-R${at.toString(36).slice(-4)}`;
      const replayEntries: TuningLogEntry[] = batch.map((e, i) => ({
        ...e,
        id: `${at.toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        ts: at,
        appliedAt: at,
        correlationId: replayId,
        replayOf: correlationId,
        phase: "applied" as const,
        mitigation: `Replay: ${label}`,
        trigger: `One-click replay of ${correlationId} — same parameters, stored preview context`,
        outcome: undefined,
        revertedAt: undefined,
        revertReason: undefined,
      }));

      setTuningLog((prev) => [...replayEntries, ...prev].slice(0, 200));
      const outcome = value.recordMitigationOutcome(replayId, nextRules);
      return { correlationId: replayId, label, entries: replayEntries, outcome };
    },
    clearTuningLog: () => setTuningLog([]),
    retention,
    setRetention: setRetentionState,
    purgeAuditHistory: (r) => {
      const policy = r ?? retention;
      const kept = applyRetention(tuningLog, policy);
      const removed = tuningLog.length - kept.length;
      if (removed > 0) setTuningLog(kept);
      return removed;
    },
    expiredAuditCount: Math.max(0, tuningLog.length - applyRetention(tuningLog, retention).length),

    simulateScannerRun,
    pushDeliveries: (d) => {
      if (d.length > 0) setDeliveries((prev) => [...d, ...prev].slice(0, 500));
    },
    clearDeliveries: () => setDeliveries([]),

    setRisk,
    resetPaper: () => {
      setCash(STARTING_CASH);
      setPositions([]);
      setTrades([]);
    },
    equity,
  };


  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePaper() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePaper must be used within PaperProvider");
  return v;
}

// Re-export to avoid unused import warnings in some routes
export { ASSETS };
