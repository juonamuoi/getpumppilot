/* ------------------------------------------------------------------ *
 * Swap readiness — one place that decides whether a live swap can be
 * attempted, and explains every blocker in plain English.
 * ------------------------------------------------------------------ */

export type ReadinessId =
  | "wallet"
  | "chain"
  | "pair"
  | "amount"
  | "limit"
  | "quote";

export type ReadinessStatus = "ok" | "blocked" | "pending";

export interface ReadinessCheck {
  id: ReadinessId;
  label: string;
  status: ReadinessStatus;
  detail: string;
  /** Optional one-tap fix the panel can offer. */
  fix?: "connect" | "switch-chain" | "amount" | "limit" | "quote";
}

export interface ReadinessInput {
  address: string | null;
  walletChainId: number | null;
  targetChainId: number;
  targetChainName: string;
  sellSymbol: string;
  buySymbol: string;
  amount: string;
  notionalUsd: number | null;
  maxTradeUsd: number;
  hasQuote: boolean;
  needsApproval: boolean;
}

export interface ReadinessResult {
  checks: ReadinessCheck[];
  /** All inputs valid and a route is loaded — signing can start. */
  ready: boolean;
  /** Everything except the quote is valid — "Get route & quote" is safe. */
  canQuote: boolean;
  blockers: ReadinessCheck[];
  /** Short headline for the status pill. */
  headline: string;
}

export function evaluateSwapReadiness(input: ReadinessInput): ReadinessResult {
  const checks: ReadinessCheck[] = [];

  checks.push(
    input.address
      ? {
          id: "wallet",
          label: "Wallet connected",
          status: "ok",
          detail: `Signing as ${input.address.slice(0, 6)}…${input.address.slice(-4)}`,
        }
      : {
          id: "wallet",
          label: "Wallet connected",
          status: "blocked",
          detail: "Connect a browser wallet or unlock your PumpPilot wallet.",
          fix: "connect",
        },
  );

  if (!input.address) {
    checks.push({
      id: "chain",
      label: `Network is ${input.targetChainName}`,
      status: "pending",
      detail: "Waiting for a wallet connection.",
    });
  } else if (input.walletChainId === null) {
    checks.push({
      id: "chain",
      label: `Network is ${input.targetChainName}`,
      status: "pending",
      detail: "Checking which network your wallet is on…",
    });
  } else if (input.walletChainId === input.targetChainId) {
    checks.push({
      id: "chain",
      label: `Network is ${input.targetChainName}`,
      status: "ok",
      detail: `Your wallet is on ${input.targetChainName}.`,
    });
  } else {
    checks.push({
      id: "chain",
      label: `Network is ${input.targetChainName}`,
      status: "blocked",
      detail: `Your wallet is on chain ${input.walletChainId}. Switch to ${input.targetChainName}.`,
      fix: "switch-chain",
    });
  }

  const samePair = input.sellSymbol === input.buySymbol;
  checks.push({
    id: "pair",
    label: "Token pair valid",
    status: samePair ? "blocked" : "ok",
    detail: samePair
      ? "Sell and buy tokens must be different."
      : `${input.sellSymbol} → ${input.buySymbol}`,
  });

  const qty = Number(input.amount);
  const amountOk = input.amount.trim() !== "" && Number.isFinite(qty) && qty > 0;
  checks.push({
    id: "amount",
    label: "Amount entered",
    status: amountOk ? "ok" : "blocked",
    detail: amountOk
      ? `Selling ${qty} ${input.sellSymbol}`
      : "Enter an amount greater than zero.",
    fix: amountOk ? undefined : "amount",
  });

  const overLimit =
    input.notionalUsd !== null && input.notionalUsd > input.maxTradeUsd;
  checks.push({
    id: "limit",
    label: "Within per-trade limit",
    status: overLimit ? "blocked" : "ok",
    detail: overLimit
      ? `≈ $${input.notionalUsd!.toLocaleString(undefined, { maximumFractionDigits: 2 })} exceeds your $${input.maxTradeUsd.toLocaleString()} limit.`
      : `Limit $${input.maxTradeUsd.toLocaleString()} per trade.`,
    fix: overLimit ? "limit" : undefined,
  });

  checks.push({
    id: "quote",
    label: "Route & quote loaded",
    status: input.hasQuote ? "ok" : "pending",
    detail: input.hasQuote
      ? input.needsApproval
        ? `Route ready — one-time ${input.sellSymbol} approval first.`
        : "Route ready — you can sign and submit."
      : "Fetch a live route to price the swap.",
    fix: input.hasQuote ? undefined : "quote",
  });

  const blockers = checks.filter((c) => c.status === "blocked");
  const canQuote = blockers.length === 0;
  const ready = canQuote && input.hasQuote;

  const headline = ready
    ? input.needsApproval
      ? "Ready to approve"
      : "Ready to trade"
    : blockers.length > 0
      ? blockers[0]!.detail
      : "Fetch a route to continue";

  return { checks, ready, canQuote, blockers, headline };
}
