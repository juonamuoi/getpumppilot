// Pure helpers to compute trade-journal analytics from paper-store state.
import type { Position, Trade } from "./paper-store";
import { getAsset } from "./mock-data";

export type ClosedTrade = {
  symbol: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  entryTs: number;
  exitTs: number;
  pnl: number;
  pnlPct: number;
};

export type JournalStats = {
  totalTrades: number;
  closedCount: number;
  wins: number;
  losses: number;
  winRate: number; // 0..100
  avgWin: number;
  avgLoss: number;
  expectancy: number; // avg $ per closed trade
  profitFactor: number; // sum(wins)/|sum(losses)|
  bestTrade: ClosedTrade | null;
  worstTrade: ClosedTrade | null;
  equityCurve: { ts: number; equity: number; cash: number }[];
  perSymbol: {
    symbol: string;
    closed: number;
    wins: number;
    winRate: number;
    netPnl: number;
  }[];
};

// FIFO pairing of buys → sells within a symbol.
export function pairFifo(trades: Trade[]): ClosedTrade[] {
  const byTs = [...trades].sort((a, b) => a.ts - b.ts);
  const openBySym: Record<string, { qty: number; price: number; ts: number }[]> = {};
  const closed: ClosedTrade[] = [];

  for (const t of byTs) {
    const lots = (openBySym[t.symbol] ||= []);
    if (t.side === "buy") {
      lots.push({ qty: t.qty, price: t.price, ts: t.ts });
      continue;
    }
    // sell — consume FIFO
    let remaining = t.qty;
    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(lot.qty, remaining);
      const pnl = (t.price - lot.price) * take;
      closed.push({
        symbol: t.symbol,
        qty: take,
        entryPrice: lot.price,
        exitPrice: t.price,
        entryTs: lot.ts,
        exitTs: t.ts,
        pnl,
        pnlPct: ((t.price - lot.price) / lot.price) * 100,
      });
      lot.qty -= take;
      remaining -= take;
      if (lot.qty <= 1e-9) lots.shift();
    }
  }
  return closed;
}

export function computeStats(
  trades: Trade[],
  positions: Position[],
  cash: number,
  startingCash: number,
): JournalStats {
  const closed = pairFifo(trades);
  const wins = closed.filter((c) => c.pnl > 0);
  const losses = closed.filter((c) => c.pnl < 0);

  const sumWin = wins.reduce((s, c) => s + c.pnl, 0);
  const sumLoss = losses.reduce((s, c) => s + c.pnl, 0);

  const avgWin = wins.length ? sumWin / wins.length : 0;
  const avgLoss = losses.length ? sumLoss / losses.length : 0;
  const expectancy = closed.length ? (sumWin + sumLoss) / closed.length : 0;
  const profitFactor = sumLoss < 0 ? sumWin / Math.abs(sumLoss) : sumWin > 0 ? Infinity : 0;

  // Equity curve: reconstruct cash + mark-to-market of held qty after each trade.
  const byTs = [...trades].sort((a, b) => a.ts - b.ts);
  const held: Record<string, number> = {};
  let runCash = startingCash;
  const curve: { ts: number; equity: number; cash: number }[] = [];
  if (byTs.length === 0) {
    // still show a flat baseline plus current point
    curve.push({ ts: Date.now() - 1, equity: startingCash, cash: startingCash });
  }
  for (const t of byTs) {
    const notional = t.price * t.qty;
    if (t.side === "buy") {
      runCash -= notional;
      held[t.symbol] = (held[t.symbol] || 0) + t.qty;
    } else {
      runCash += notional;
      held[t.symbol] = (held[t.symbol] || 0) - t.qty;
    }
    // mark held at trade price (approximation — no historical mid available)
    let mtm = 0;
    for (const [sym, qty] of Object.entries(held)) {
      const px = sym === t.symbol ? t.price : getAsset(sym)?.price ?? t.price;
      mtm += qty * px;
    }
    curve.push({ ts: t.ts, equity: runCash + mtm, cash: runCash });
  }
  // final point at "now" using current market
  const posValueNow = positions.reduce((s, p) => {
    const a = getAsset(p.symbol);
    return s + (a ? a.price * p.qty : 0);
  }, 0);
  curve.push({ ts: Date.now(), equity: cash + posValueNow, cash });

  // best / worst
  const bestTrade = closed.reduce<ClosedTrade | null>(
    (b, c) => (!b || c.pnl > b.pnl ? c : b),
    null,
  );
  const worstTrade = closed.reduce<ClosedTrade | null>(
    (b, c) => (!b || c.pnl < b.pnl ? c : b),
    null,
  );

  // per-symbol
  const grouped: Record<string, ClosedTrade[]> = {};
  for (const c of closed) (grouped[c.symbol] ||= []).push(c);
  const perSymbol = Object.entries(grouped)
    .map(([symbol, arr]) => {
      const w = arr.filter((c) => c.pnl > 0).length;
      const netPnl = arr.reduce((s, c) => s + c.pnl, 0);
      return {
        symbol,
        closed: arr.length,
        wins: w,
        winRate: (w / arr.length) * 100,
        netPnl,
      };
    })
    .sort((a, b) => b.netPnl - a.netPnl);

  return {
    totalTrades: trades.length,
    closedCount: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    avgWin,
    avgLoss,
    expectancy,
    profitFactor,
    bestTrade,
    worstTrade,
    equityCurve: curve,
    perSymbol,
  };
}
