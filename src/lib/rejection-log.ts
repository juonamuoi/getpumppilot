// Persistent history of risk-blocked orders.
// Every rejection is recorded with its timestamp, the control that fired,
// the breaching value and the suggested fix so it can be reviewed later.
import { useStableSyncExternalStore } from "@/lib/snapshot-invariant";
import type { RiskBlock } from "./risk-block";

export type RejectionEntry = {
  id: string;
  ts: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  mode: "paper" | "live";
  block: RiskBlock;
};

const KEY = "pp.rejection-log";
const MAX = 200;
const EMPTY: RejectionEntry[] = [];

let entries: RejectionEntry[] | null = null;
const listeners = new Set<() => void>();

function load(): RejectionEntry[] {
  if (entries) return entries;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    entries = raw ? (JSON.parse(raw) as RejectionEntry[]) : [];
  } catch {
    entries = [];
  }
  return entries;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries ?? []));
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const l of listeners) l();
}

export function recordRejection(input: {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  block: RiskBlock;
  mode?: "paper" | "live";
}) {
  const list = load();
  const entry: RejectionEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    symbol: input.symbol,
    side: input.side,
    qty: input.qty,
    mode: input.mode ?? "paper",
    block: input.block,
  };
  entries = [entry, ...list].slice(0, MAX);
  persist();
  emit();
  return entry;
}

export function clearRejections() {
  entries = [];
  persist();
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRejectionLog(): RejectionEntry[] {
  return useStableSyncExternalStore(
    subscribe,
    load,
    () => EMPTY,
    "rejection-log",
  );
}

/** CSV export of the rejection history. */
export function rejectionsToCsv(list: RejectionEntry[]): string {
  const head = "timestamp,side,symbol,qty,mode,control,limit_pct,actual_pct,suggested_fix";
  const rows = list.map((e) =>
    [
      new Date(e.ts).toISOString(),
      e.side,
      e.symbol,
      String(e.qty),
      e.mode,
      e.block.control,
      e.block.limitPct != null ? e.block.limitPct.toFixed(2) : "",
      e.block.actualPct != null ? e.block.actualPct.toFixed(2) : "",
      `"${e.block.remedy.replace(/"/g, '""')}"`,
    ].join(","),
  );
  return [head, ...rows].join("\n");
}
