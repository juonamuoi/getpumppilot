/**
 * Simulated stop-loss / take-profit watcher for paper holdings.
 *
 * Ticks a simulated price per holding (seeded from live reference prices when
 * available, otherwise the demo dataset) and fires an event the first time a
 * holding crosses its configured stop-loss or take-profit level. The trigger
 * re-arms once price moves back inside the band, so a hovering price does not
 * spam the user.
 *
 * All prices are simulated / demo data — no real orders are ever placed.
 */
import { useEffect, useRef, useState } from "react";

export type RiskHitKind = "stop-loss" | "take-profit";

export type RiskHit = {
  id: string;
  symbol: string;
  kind: RiskHitKind;
  /** Price that triggered the hit. */
  price: number;
  /** Configured trigger level. */
  level: number;
  avgCost: number;
  qty: number;
  /** Unrealised P&L in USD at the trigger price. */
  pnlUsd: number;
  pnlPct: number;
  at: string;
};

const MAX_HITS = 50;
const KEY = "pumppilot.risk-hits.v1";
const EVT = "pumppilot:risk-hits";

let hits: RiskHit[] = [];
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) hits = parsed as RiskHit[];
  } catch {
    /* ignore */
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(hits));
  } catch {
    /* storage unavailable — keep in memory */
  }
  window.dispatchEvent(new Event(EVT));
}

export function recordRiskHit(hit: RiskHit) {
  load();
  hits = [hit, ...hits].slice(0, MAX_HITS);
  persist();
}

export function clearRiskHits() {
  hits = [];
  persist();
}

/** Reactive list of recent stop/target hits. */
export function useRiskHits() {
  const [list, setList] = useState<RiskHit[]>([]);
  useEffect(() => {
    load();
    const sync = () => setList([...hits]);
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { hits: list, clear: clearRiskHits };
}

/**
 * Random-walk a simulated price around a reference. Small steps keep the
 * demo believable while still crossing levels within a session.
 */
export function nextSimPrice(current: number, reference: number) {
  const drift = (reference - current) * 0.05; // pull back toward reference
  const step = current * (Math.random() - 0.5) * 0.012; // ±0.6%
  return Math.max(current + drift + step, reference * 0.2);
}

/** Ticking simulated prices for a set of symbols. */
export function useSimulatedPrices(
  references: Record<string, number>,
  opts: { enabled?: boolean; intervalMs?: number } = {},
) {
  const { enabled = true, intervalMs = 5000 } = opts;
  const refs = useRef(references);
  refs.current = references;
  const [prices, setPrices] = useState<Record<string, number>>(references);

  useEffect(() => {
    // Seed any newly added symbols.
    setPrices((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [s, p] of Object.entries(references)) {
        if (next[s] === undefined) {
          next[s] = p;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [Object.keys(references).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      setPrices((prev) => {
        const next: Record<string, number> = {};
        for (const [s, ref] of Object.entries(refs.current)) {
          next[s] = nextSimPrice(prev[s] ?? ref, ref);
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(t);
  }, [enabled, intervalMs]);

  return prices;
}
