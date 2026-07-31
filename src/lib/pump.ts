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
  return data as { ok: boolean; reason?: string; payout_address?: string | null };
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
      return "Not enough PUMP for that transfer.";
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
