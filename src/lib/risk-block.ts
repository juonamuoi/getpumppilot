/**
 * Structured reasons a risk control rejected an order.
 *
 * Every block carries the limit, the value that breached it and a concrete
 * remedy so we can speak a full explanation to screen-reader users instead of
 * a bare "rejected" toast.
 */
export type RiskBlockCode =
  | "max_position"
  | "max_daily_loss"
  | "insufficient_cash"
  | "insufficient_position";

export type RiskBlock = {
  code: RiskBlockCode;
  /** Short human label for the control that fired. */
  control: string;
  /** Configured limit, in percent where applicable. */
  limitPct?: number;
  /** Measured value that breached the limit, in percent where applicable. */
  actualPct?: number;
  /** Room left under the breached limit after the rejection, in USD. */
  headroomUsd?: number;
  /** Same headroom expressed in units of the traded symbol. */
  headroomQty?: number;
  /** What the headroom is measured against, e.g. "SOL position cap". */
  headroomLabel?: string;
  /** What the user can do about it. */
  remedy: string;
};


const CONTROL_TITLE: Record<RiskBlockCode, string> = {
  max_position: "Max position size",
  max_daily_loss: "Max daily loss",
  insufficient_cash: "Available paper cash",
  insufficient_position: "Position size",
};

function pct(n: number) {
  return `${n.toFixed(n < 10 ? 1 : 0)}%`;
}

/** One sentence explaining why the control fired, for toasts and live regions. */
export function describeRiskBlock(block: RiskBlock): string {
  switch (block.code) {
    case "max_position":
      return `Max exposure limit: this order would put ${pct(
        block.actualPct ?? 0,
      )} of your equity in one position, above your ${pct(
        block.limitPct ?? 0,
      )} maximum. ${block.remedy}`;
    case "max_daily_loss":
      return `Max drawdown limit: you are down ${pct(
        block.actualPct ?? 0,
      )} today, at or beyond your ${pct(
        block.limitPct ?? 0,
      )} daily loss limit, so new buys are paused. ${block.remedy}`;
    default:
      return `${CONTROL_TITLE[block.code]}: ${block.remedy}`;
  }
}

/** Assertive live-region text spoken when an order is blocked. */
export function announceRiskBlock(
  block: RiskBlock,
  side: "buy" | "sell",
  qty: number,
  symbol: string,
): string {
  return `Order rejected by risk controls. ${side} ${qty} ${symbol} was blocked by the ${
    block.control
  } control. ${describeRiskBlock(block)}`;
}

export function riskBlockTitle(block: RiskBlock): string {
  return CONTROL_TITLE[block.code];
}

/** Title for a bare control code (e.g. filter chips in rejection history). */
export function controlTitle(code: RiskBlockCode): string {
  return CONTROL_TITLE[code];
}
