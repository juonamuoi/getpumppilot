/* ------------------------------------------------------------------ *
 * Friendly swap / approval error mapping.
 *
 * Wallet + aggregator errors are cryptic ("execution reverted", code 4001).
 * We translate them into a plain-English title, a short explanation, and
 * concrete suggested fixes, plus which retry action makes sense.
 * ------------------------------------------------------------------ */

export type SwapErrorStage = "quote" | "approve" | "swap" | "chain";

/** Which one-click action should the retry button run. */
export type SwapRetryAction = "requote" | "approve" | "swap" | "switch-chain" | "none";

export interface FriendlySwapError {
  stage: SwapErrorStage;
  title: string;
  detail: string;
  fixes: string[];
  retry: SwapRetryAction;
  retryLabel: string;
  /** User deliberately declined — don't show it as a scary failure. */
  userRejected: boolean;
  raw?: string;
}

function rawMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const anyErr = e as { message?: unknown; data?: { message?: unknown }; shortMessage?: unknown };
    if (typeof anyErr.shortMessage === "string") return anyErr.shortMessage;
    if (typeof anyErr.message === "string") return anyErr.message;
    if (anyErr.data && typeof anyErr.data.message === "string") return anyErr.data.message;
  }
  return "Unknown wallet error.";
}

function errorCode(e: unknown): number | null {
  if (e && typeof e === "object") {
    const c = (e as { code?: unknown }).code;
    if (typeof c === "number") return c;
    if (typeof c === "string" && /^-?\d+$/.test(c)) return Number(c);
  }
  return null;
}

const RETRY_LABELS: Record<SwapRetryAction, string> = {
  requote: "Refresh quote & retry",
  approve: "Try approval again",
  swap: "Sign & submit again",
  "switch-chain": "Switch network & retry",
  none: "Try again",
};

/**
 * Translate any thrown wallet/aggregator error into something a human can act on.
 */
export function explainSwapError(
  e: unknown,
  stage: SwapErrorStage,
  ctx: { sellSymbol?: string; chainName?: string } = {},
): FriendlySwapError {
  const raw = rawMessage(e);
  const lower = raw.toLowerCase();
  const code = errorCode(e);
  const sell = ctx.sellSymbol ?? "the token";
  const chain = ctx.chainName ?? "the selected network";

  const build = (
    partial: Omit<FriendlySwapError, "stage" | "retryLabel" | "raw" | "userRejected"> &
      Partial<Pick<FriendlySwapError, "userRejected">>,
  ): FriendlySwapError => ({
    stage,
    raw,
    userRejected: partial.userRejected ?? false,
    retryLabel: RETRY_LABELS[partial.retry],
    ...partial,
  });

  // 1. User rejected the signature request.
  if (code === 4001 || lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return build({
      title: stage === "approve" ? "You cancelled the approval" : "You cancelled the signature",
      detail: "Nothing was sent to the network and no funds moved.",
      fixes: [
        "Open your wallet and confirm the request when the popup appears.",
        "If no popup showed up, unlock your wallet extension or app first.",
      ],
      retry: stage === "approve" ? "approve" : "swap",
      userRejected: true,
    });
  }

  // 2. Pending request already open in the wallet.
  if (code === -32002 || lower.includes("already pending") || lower.includes("request already")) {
    return build({
      title: "Your wallet already has a pending request",
      detail: "A previous popup is still waiting for you to approve or reject it.",
      fixes: [
        "Open your wallet and clear the pending request.",
        "Then come back and retry — you won't be charged twice.",
      ],
      retry: stage === "approve" ? "approve" : "swap",
    });
  }

  // 3. Wrong network / unrecognised chain.
  if (code === 4902 || lower.includes("chain") && (lower.includes("mismatch") || lower.includes("unrecognized") || lower.includes("not added") || lower.includes("switch"))) {
    return build({
      title: `Your wallet isn't on ${chain}`,
      detail: "The route was built for a different network, so the transaction can't be signed.",
      fixes: [
        `Switch your wallet's active network to ${chain}.`,
        `If ${chain} is missing, add it in your wallet's network settings first.`,
      ],
      retry: "switch-chain",
    });
  }

  // 4. Not enough gas / balance.
  if (
    lower.includes("insufficient funds") ||
    lower.includes("insufficient balance") ||
    lower.includes("gas required exceeds") ||
    lower.includes("exceeds balance")
  ) {
    return build({
      title: "Not enough balance to cover the trade plus gas",
      detail: "Your wallet needs the sell amount and a little native token left over for network fees.",
      fixes: [
        "Lower the sell amount so there's gas headroom.",
        `Top up the native gas token on ${chain}.`,
      ],
      retry: "requote",
    });
  }

  // 5. Allowance problems.
  if (lower.includes("allowance") || lower.includes("transfer amount exceeds allowance") || lower.includes("erc20")) {
    return build({
      title: `${sell} spending approval is missing or too low`,
      detail: "The router can't move your tokens until you approve it once.",
      fixes: [
        `Run the one-time ${sell} approval, wait for it to confirm, then swap.`,
        "If you previously approved a smaller amount, approve again for the new size.",
      ],
      retry: "approve",
    });
  }

  // 6. Slippage / price movement.
  if (
    lower.includes("slippage") ||
    lower.includes("price impact") ||
    lower.includes("min return") ||
    lower.includes("insufficient output") ||
    lower.includes("too little received")
  ) {
    return build({
      title: "The price moved past your slippage limit",
      detail: "The market shifted between the quote and your signature, so the trade would have filled worse than allowed.",
      fixes: [
        "Refresh the quote — prices update every few seconds.",
        "Raise max slippage slightly in Risk controls if the pair is volatile or thin.",
        "Try a smaller size to reduce price impact.",
      ],
      retry: "requote",
    });
  }

  // 7. Deadline / stale quote.
  if (lower.includes("expired") || lower.includes("deadline") || lower.includes("stale")) {
    return build({
      title: "That quote expired",
      detail: "Routes are only valid for a short window before they go stale.",
      fixes: ["Get a fresh route & quote, then sign promptly."],
      retry: "requote",
    });
  }

  // 8. Generic revert.
  if (lower.includes("execution reverted") || lower.includes("call revert") || lower.includes("cannot estimate gas")) {
    return build({
      title: "The network rejected the simulated trade",
      detail: "This usually means liquidity changed or the token has transfer restrictions.",
      fixes: [
        "Refresh the quote and try again.",
        "Try a smaller amount or a different pair.",
        "Some tokens charge transfer fees — increase slippage for those.",
      ],
      retry: "requote",
    });
  }

  // 9. Network / RPC issues.
  if (lower.includes("fetch") || lower.includes("network error") || lower.includes("timeout") || lower.includes("503") || lower.includes("econn")) {
    return build({
      title: "Couldn't reach the network",
      detail: "The request to the router or RPC endpoint didn't complete.",
      fixes: ["Check your connection and retry.", "If it keeps failing, switch RPC in your wallet settings."],
      retry: stage === "quote" ? "requote" : "swap",
    });
  }

  // 10. No route from the aggregator.
  if (lower.includes("no route") || lower.includes("no liquidity") || lower.includes("insufficient liquidity")) {
    return build({
      title: "No route found for this pair",
      detail: "The aggregator couldn't find enough liquidity for that size right now.",
      fixes: ["Try a smaller amount.", "Route through a major pair such as USDC or ETH first."],
      retry: "requote",
    });
  }

  return build({
    title: stage === "approve" ? "Approval didn't go through" : "The transaction didn't go through",
    detail: raw.slice(0, 200),
    fixes: [
      "Refresh the quote and retry — most failures are transient.",
      "Make sure your wallet is unlocked and on the right network.",
    ],
    retry: stage === "quote" ? "requote" : "swap",
  });
}
