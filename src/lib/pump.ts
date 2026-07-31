/**
 * PUMP token: shared config + client helpers.
 *
 * In-app PUMP balances are an off-chain ledger held in the app database.
 * They become on-chain PUMP only after you deploy `contracts/PumpToken.sol`
 * and settle claims through its `claimReward` function.
 */
import { supabase } from "@/integrations/supabase/client";

export const PUMP_TOKEN = {
  name: "PumpPilot Token",
  symbol: "PUMP",
  decimals: 18,
  maxSupply: 1_000_000_000,
  /** Set once you deploy the contract. Empty = not deployed yet. */
  contractAddress: "",
  chain: "Base (recommended) or any EVM chain you choose",
  contractPath: "contracts/PumpToken.sol",
} as const;

export const PUMP_ALLOCATION = [
  { label: "Community rewards & quests", pct: 40 },
  { label: "Ecosystem / liquidity", pct: 25 },
  { label: "Team (4-year vest)", pct: 15 },
  { label: "Treasury", pct: 15 },
  { label: "Early supporters", pct: 5 },
] as const;

export const PUMP_SIGNUP_BONUS = 500;
export const PUMP_DAILY_SEND_LIMIT = 100_000;

export type PumpQuest = {
  key: string;
  title: string;
  description: string;
  reward: number;
  claimed: boolean;
  claimed_at: string | null;
};

export type PumpLedgerEntry = {
  id: string;
  delta: number;
  balance_after: number;
  kind: string;
  quest_key: string | null;
  memo: string | null;
  created_at: string;
};

export type PumpSummary = {
  ok: boolean;
  reason?: string;
  tag: string;
  balance: number;
  lifetime_earned: number;
  lifetime_sent: number;
  lifetime_received: number;
  payout_address: string | null;
  payout_address_updated_at: string | null;
  quests: PumpQuest[];
  ledger: PumpLedgerEntry[];
};

// The reward RPCs are security-definer and validate auth.uid() server-side.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function fetchPumpSummary(): Promise<PumpSummary> {
  const { data, error } = await rpc("pump_my_summary");
  if (error) throw new Error(error.message);
  return data as PumpSummary;
}

export async function claimPumpQuest(questKey: string) {
  const { data, error } = await rpc("pump_claim_quest", { _quest_key: questKey });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; reason?: string; awarded?: number; balance?: number };
}

export async function sendPump(toTag: string, amount: number, memo?: string) {
  const { data, error } = await rpc("pump_transfer", {
    _to_tag: toTag,
    _amount: Math.floor(amount),
    _memo: memo ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; reason?: string; sent?: number; balance?: number };
}

export async function setPumpPayoutAddress(address: string) {
  const { data, error } = await rpc("pump_set_payout_address", { _address: address });
  if (error) throw new Error(error.message);
  return data as {
    ok: boolean;
    reason?: string;
    payout_address?: string | null;
    previous_address?: string | null;
    changed?: boolean;
    payout_address_updated_at?: string | null;
  };
}

/** One leg of the double-entry record for a peer transfer. */
export type PumpTransferReceipt = {
  id: string;
  created_at: string;
  /** Shared reference that ties the two ledger legs together. */
  ref: string;
  kind: "transfer_out" | "transfer_in";
  direction: "sent" | "received";
  /** Absolute PUMP amount moved. */
  amount: number;
  /** Signed change on YOUR account (negative = debit). */
  my_delta: number;
  /** Your account balance immediately after the entry was posted. */
  my_balance_after: number;
  /** Signed change on the counterparty account (opposite sign of yours). */
  counterparty_delta: number | null;
  counterparty_tag: string | null;
  counterparty_id: string | null;
  memo: string | null;
};

export type PumpTransferHistory = {
  ok: boolean;
  reason?: string;
  total: number;
  limit: number;
  offset: number;
  transfers: PumpTransferReceipt[];
};

export const PUMP_HISTORY_PAGE_SIZE = 25;

export async function fetchPumpTransferHistory(
  limit = PUMP_HISTORY_PAGE_SIZE,
  offset = 0,
): Promise<PumpTransferHistory> {
  const { data, error } = await rpc("pump_transfer_history", { _limit: limit, _offset: offset });
  if (error) throw new Error(error.message);
  const res = data as PumpTransferHistory;
  return { ...res, transfers: res.transfers ?? [] };
}

/** Balanced double-entry lines for one transfer, from the caller's point of view. */
export function receiptLines(t: PumpTransferReceipt) {
  const you = {
    account: "You",
    role: t.direction === "sent" ? ("Debit" as const) : ("Credit" as const),
    delta: t.my_delta,
    balanceAfter: t.my_balance_after as number | null,
  };
  const them = {
    account: t.counterparty_tag ? `@${t.counterparty_tag}` : "Counterparty",
    role: t.direction === "sent" ? ("Credit" as const) : ("Debit" as const),
    delta: t.counterparty_delta ?? -t.my_delta,
    balanceAfter: null as number | null,
  };
  return t.direction === "sent" ? [you, them] : [them, you];
}

/** True when the two legs cancel out, i.e. the ledger is balanced. */
export function isReceiptBalanced(t: PumpTransferReceipt) {
  return (t.counterparty_delta ?? -t.my_delta) + t.my_delta === 0;
}

export function receiptExplanation(t: PumpTransferReceipt) {
  const tag = t.counterparty_tag ? `@${t.counterparty_tag}` : "another member";
  return t.direction === "sent"
    ? `Your account was debited ${formatPump(t.amount)} and ${tag} was credited the same amount in a single atomic entry. Nothing is minted or burned — the two lines cancel to zero.`
    : `${tag} was debited ${formatPump(t.amount)} and your account was credited the same amount in a single atomic entry. Nothing is minted or burned — the two lines cancel to zero.`;
}


export function pumpErrorMessage(reason?: string) {
  switch (reason) {
    case "unauthenticated":
      return "Sign in to use PUMP rewards.";
    case "already_claimed":
      return "You already claimed this quest.";
    case "unknown_quest":
      return "That quest is no longer available.";
    case "unknown_recipient":
      return "No member found with that PUMP tag.";
    case "self_transfer":
      return "You can't send PUMP to yourself.";
    case "insufficient_balance":
      return "Not enough PUMP for that.";
    case "unknown_perk":
      return "That perk is no longer available.";
    case "invalid_amount":
      return "Enter a whole amount between 1 and 1,000,000.";
    case "daily_limit":
      return `Daily send limit of ${PUMP_DAILY_SEND_LIMIT.toLocaleString()} PUMP reached.`;
    case "invalid_address":
      return "Enter a valid 0x… wallet address.";
    default:
      return "Something went wrong. Try again.";
  }
}

export const formatPump = (n: number) => `${Math.round(n).toLocaleString()} PUMP`;

/* ------------------------------------------------------------------ */
/* Referral PUMP rewards                                               */
/* ------------------------------------------------------------------ */

export type PumpReferralRow = {
  id: string;
  created_at: string;
  status: "awarded" | "pending";
  awarded_at: string | null;
  activation_key: string | null;
  pump: number;
};

export type PumpReferralStatus = {
  ok: boolean;
  reason?: string;
  tag: string | null;
  activation_key: string;
  activation_title: string | null;
  referrer_award: number;
  referred_award: number;
  invited: number;
  activated: number;
  pending: number;
  pump_earned: number;
  my_bonus_awarded: boolean;
  i_was_referred: boolean;
  referrals: PumpReferralRow[];
};

/** Referral bonus progress for the signed-in member. */
export async function fetchPumpReferralStatus(): Promise<PumpReferralStatus> {
  const { data, error } = await rpc("pump_referral_status");
  if (error) throw new Error(error.message);
  return data as PumpReferralStatus;
}

/* ------------------------------------------------------------------ */
/* PUMP redemption — spend PUMP on in-app perks (never market trading) */
/* ------------------------------------------------------------------ */

export type PumpPerk = {
  key: string;
  title: string;
  description: string;
  cost: number;
  /** Null for one-off perks such as credit packs. */
  duration_days: number | null;
  /** App credits granted on redeem (0 for feature unlocks). */
  credits: number;
  category: "feature" | "credits" | string;
  /** ISO date this perk stays unlocked until, or null when not active. */
  active_until: string | null;
  times_redeemed: number;
};

export type PumpRedemption = {
  id: string;
  perk_key: string;
  title: string;
  cost: number;
  credits_granted: number;
  created_at: string;
  expires_at: string | null;
};

export type PumpPerkState = {
  ok: boolean;
  reason?: string;
  balance: number;
  perks: PumpPerk[];
  history: PumpRedemption[];
};

/** Catalog of redeemable perks plus what the member already unlocked. */
export async function fetchPumpPerks(): Promise<PumpPerkState> {
  const { data, error } = await rpc("pump_my_perks");
  if (error) throw new Error(error.message);
  return data as PumpPerkState;
}

/** Spend PUMP on an in-app perk. Deducted through the double-entry ledger. */
export async function redeemPumpPerk(perkKey: string) {
  const { data, error } = await rpc("pump_redeem", { _perk_key: perkKey });
  if (error) throw new Error(error.message);
  return data as {
    ok: boolean;
    reason?: string;
    perk?: string;
    title?: string;
    spent?: number;
    balance?: number;
    expires_at?: string | null;
    credits_granted?: number;
  };
}

/** True when a timed perk is currently unlocked. */
export function isPerkActive(perk: Pick<PumpPerk, "active_until">) {
  return !!perk.active_until && new Date(perk.active_until).getTime() > Date.now();
}
