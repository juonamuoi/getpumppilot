/**
 * PumpPilot AI credit system.
 *
 * The app is pay-as-you-go: every AI prediction, Copilot answer, backtest and
 * bot execution burns credits. When the balance hits zero the bot stops
 * predicting and stops executing until the account is recharged.
 */

export type CreditFeature =
  | "momentum_prediction"
  | "scanner_scan"
  | "copilot_message"
  | "doctor_audit"
  | "backtest_run"
  | "journal_insight"
  | "bot_execution";

export const CREDIT_COSTS: Record<CreditFeature, number> = {
  momentum_prediction: 1,
  scanner_scan: 2,
  copilot_message: 2,
  doctor_audit: 10,
  backtest_run: 5,
  journal_insight: 3,
  bot_execution: 1,
};

export const CREDIT_LABELS: Record<CreditFeature, string> = {
  momentum_prediction: "Momentum prediction",
  scanner_scan: "Scanner run",
  copilot_message: "Copilot answer",
  doctor_audit: "Portfolio Doctor audit",
  backtest_run: "Backtest run",
  journal_insight: "Journal insight",
  bot_execution: "Bot execution",
};

/** Balance at or below this shows the recharge warning everywhere. */
export const LOW_BALANCE_THRESHOLD = 25;

/** Credits handed to every new account. */
export const WELCOME_CREDITS = 100;

export type CreditPack = {
  priceId: string;
  productId: string;
  name: string;
  credits: number;
  priceLabel: string;
  amountCents: number;
  tag?: string;
  highlight?: boolean;
};

export const CREDIT_PACKS: CreditPack[] = [
  {
    priceId: "credits_starter_pack",
    productId: "credits_starter",
    name: "Starter",
    credits: 500,
    priceLabel: "$9",
    amountCents: 900,
    tag: "Try it out",
  },
  {
    priceId: "credits_trader_pack",
    productId: "credits_trader",
    name: "Trader",
    credits: 2000,
    priceLabel: "$29",
    amountCents: 2900,
    tag: "Most popular",
    highlight: true,
  },
  {
    priceId: "credits_quant_pack",
    productId: "credits_quant",
    name: "Quant",
    credits: 8000,
    priceLabel: "$99",
    amountCents: 9900,
    tag: "Best value",
  },
  {
    priceId: "credits_desk_pack",
    productId: "credits_desk",
    name: "Desk",
    credits: 25000,
    priceLabel: "$249",
    amountCents: 24900,
    tag: "For teams & bots",
  },
];

/** Credits granted per unit purchased, keyed by price lookup key. Used by the payment webhook. */
export const CREDITS_BY_PRICE_ID: Record<string, number> = Object.fromEntries(
  CREDIT_PACKS.map((p) => [p.priceId, p.credits]),
);

export function creditsForPrice(priceId: string | undefined | null): number {
  if (!priceId) return 0;
  return CREDITS_BY_PRICE_ID[priceId] ?? 0;
}

export function packByPriceId(priceId: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.priceId === priceId);
}

export function costPerDollar(pack: CreditPack): string {
  return (pack.credits / (pack.amountCents / 100)).toFixed(0);
}
