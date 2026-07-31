// Shared live-price registry.
//
// Lets non-hook code (the paper store's mark-to-market and fill logic) read
// the same CoinGecko prices the UI shows, so /paper, /dashboard and the asset
// detail page never disagree about what a position is worth.
// Still simulated trading — this only decides the *mark*, never a real order.

const prices: Record<string, number> = {};

/** Called by the live-asset overlay whenever fresh prices arrive. */
export function setLivePrices(next: Record<string, number>): void {
  for (const [symbol, price] of Object.entries(next)) {
    if (price > 0) prices[symbol.toUpperCase()] = price;
  }
}

/** Latest live price for a symbol, or undefined when not covered by the feed. */
export function livePriceOf(symbol: string): number | undefined {
  return prices[symbol.toUpperCase()];
}
