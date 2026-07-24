import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ASSETS, getAsset } from "./mock-data";

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

type State = {
  cash: number;
  positions: Position[];
  trades: Trade[];
  alerts: Alert[];
  liveExecutionEnabled: boolean; // always false — locked
  masterSwitchLocked: boolean;
  risk: {
    maxPositionPct: number;
    maxDailyLossPct: number;
    stopLossPct: number;
    takeProfitPct: number;
  };
  trade: (symbol: string, side: "buy" | "sell", qty: number) => { ok: boolean; msg: string };
  addAlert: (a: Omit<Alert, "id" | "active"> & { active?: boolean }) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  setRisk: (r: State["risk"]) => void;
  resetPaper: () => void;
  equity: number;
};

const STARTING_CASH = 100_000;

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

  const equity = useMemo(() => {
    const posValue = positions.reduce((s, p) => {
      const a = getAsset(p.symbol);
      return s + (a ? a.price * p.qty : 0);
    }, 0);
    return cash + posValue;
  }, [cash, positions]);

  const trade: State["trade"] = (symbol, side, qty) => {
    const a = getAsset(symbol);
    if (!a) return { ok: false, msg: "Unknown symbol" };
    if (qty <= 0) return { ok: false, msg: "Quantity must be positive" };
    const notional = a.price * qty;

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
          const avgCost = (ex.avgCost * ex.qty + a.price * qty) / totalQty;
          return prev.map((p) => (p.symbol === symbol ? { ...p, qty: totalQty, avgCost } : p));
        }
        return [...prev, { symbol, qty, avgCost: a.price }];
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
      { id: Math.random().toString(36).slice(2), ts: Date.now(), symbol, side, qty, price: a.price },
      ...t,
    ]);
    return { ok: true, msg: `Paper ${side.toUpperCase()} ${qty} ${symbol} @ ${a.price}` };
  };

  const value: State = {
    cash,
    positions,
    trades,
    alerts,
    liveExecutionEnabled: false,
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
