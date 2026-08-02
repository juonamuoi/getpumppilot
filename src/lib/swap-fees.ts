/* ------------------------------------------------------------------ *
 * Swap cost math — network fee (gas) + slippage exposure.
 *
 * Pure functions so they can be unit tested and reused outside the panel.
 * ------------------------------------------------------------------ */

/** Native gas token for each supported chain. */
export function nativeSymbolFor(chainId: number): string {
  if (chainId === 137) return "MATIC";
  return "ETH"; // mainnet, Base, Arbitrum, Optimism
}

export interface SwapCostInput {
  chainId: number;
  /** From the aggregator quote (wei of the native token). */
  totalNetworkFeeWei?: string | null;
  /** USD price of the native gas token, when known. */
  nativeUsd?: number | null;
  /** Notional value of the trade in USD, when known. */
  notionalUsd?: number | null;
  slippageBps: number;
}

export type CostSeverity = "ok" | "warn" | "high";

export interface SwapCostEstimate {
  nativeSymbol: string;
  /** Fee in whole native units, e.g. 0.00042 ETH. */
  feeNative: number | null;
  feeUsd: number | null;
  /** Fee as a share of the trade notional, 0-1. */
  feePctOfTrade: number | null;
  /** Worst-case USD given away to slippage at the configured tolerance. */
  slippageWorstCaseUsd: number | null;
  slippagePct: number;
  severity: CostSeverity;
  warnings: string[];
}

const WEI = 1e18;

/** Fee is "warn" above 1.5% of notional and "high" above 4%, or above $25 absolute. */
export function estimateSwapCost(input: SwapCostInput): SwapCostEstimate {
  const nativeSymbol = nativeSymbolFor(input.chainId);
  const slippagePct = input.slippageBps / 10_000;

  let feeNative: number | null = null;
  if (input.totalNetworkFeeWei) {
    const n = Number(input.totalNetworkFeeWei);
    if (Number.isFinite(n)) feeNative = n / WEI;
  }

  const feeUsd =
    feeNative !== null && input.nativeUsd && input.nativeUsd > 0
      ? feeNative * input.nativeUsd
      : null;

  const notional = input.notionalUsd && input.notionalUsd > 0 ? input.notionalUsd : null;
  const feePctOfTrade = feeUsd !== null && notional ? feeUsd / notional : null;
  const slippageWorstCaseUsd = notional ? notional * slippagePct : null;

  const warnings: string[] = [];
  let severity: CostSeverity = "ok";

  if (feePctOfTrade !== null) {
    if (feePctOfTrade >= 0.04) {
      severity = "high";
      warnings.push(
        `Network fees eat ${(feePctOfTrade * 100).toFixed(1)}% of this trade — unusually high. Wait for calmer gas or increase the size.`,
      );
    } else if (feePctOfTrade >= 0.015) {
      severity = "warn";
      warnings.push(
        `Network fees are ${(feePctOfTrade * 100).toFixed(1)}% of the trade. Small trades are fee-heavy right now.`,
      );
    }
  }

  if (feeUsd !== null && feeUsd >= 25) {
    severity = "high";
    warnings.push(
      `Estimated gas of $${feeUsd.toFixed(2)} is well above normal. Consider an L2 like Base or Arbitrum.`,
    );
  } else if (feeUsd !== null && feeUsd >= 8 && severity === "ok") {
    severity = "warn";
    warnings.push(`Gas is elevated at about $${feeUsd.toFixed(2)} for this swap.`);
  }

  if (input.slippageBps >= 200) {
    if (severity === "ok") severity = "warn";
    warnings.push(
      `Slippage tolerance is ${(slippagePct * 100).toFixed(2)}% — you could receive noticeably less than quoted.`,
    );
  }

  return {
    nativeSymbol,
    feeNative,
    feeUsd,
    feePctOfTrade,
    slippageWorstCaseUsd,
    slippagePct,
    severity,
    warnings,
  };
}

export function formatNative(v: number, symbol: string): string {
  const digits = v < 0.001 ? 6 : v < 1 ? 5 : 4;
  return `${v.toFixed(digits)} ${symbol}`;
}
