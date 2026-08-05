/**
 * Quest progress signals.
 *
 * PUMP quests are claimed server-side (`pump_claim_quest`), but the app can
 * tell locally whether the underlying action has been done yet. That drives
 * the quest dashboard: unlocked (ready to claim), pending (action not done),
 * or claimed.
 */
import { useSyncExternalStore } from "react";

const KEY = "pumppilot.quest-actions.v1";

export type QuestActionKey =
  | "connect_wallet"
  | "first_scan"
  | "security_scan"
  | "create_alert"
  | "paper_trade"
  | "complete_tour"
  | "refer_friend";

type Actions = Partial<Record<QuestActionKey, string>>;

let cache: Actions | null = null;
const listeners = new Set<() => void>();

// Stable empty snapshot — a fresh {} per call makes useSyncExternalStore loop.
const EMPTY_ACTIONS: Actions = {};

function read(): Actions {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY_ACTIONS;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Actions) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Actions) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l();
}

/** Record that the user completed a quest's in-app action. Idempotent. */
export function markQuestAction(key: QuestActionKey, at: Date = new Date()) {
  if (typeof window === "undefined") return;
  const cur = read();
  if (cur[key]) return;
  write({ ...cur, [key]: at.toISOString() });
}

export function getQuestActions(): Actions {
  return read();
}

export function useQuestActions(): Actions {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => EMPTY_ACTIONS,
  );
}

/** Where to go to complete each quest. */
export const QUEST_CTA: Record<string, { label: string; to: string }> = {
  connect_wallet: { label: "Connect a wallet", to: "/dashboard" },
  first_scan: { label: "Open the scanner", to: "/scanner" },
  security_scan: { label: "Run a security scan", to: "/security" },
  create_alert: { label: "Create an alert", to: "/alerts" },
  paper_trade: { label: "Place a paper trade", to: "/paper" },
  complete_tour: { label: "Start the guided tour", to: "/dashboard" },
  refer_friend: { label: "Get your referral link", to: "/refer" },
};

/** Plain-English unlock condition per quest. */
export const QUEST_UNLOCK: Record<string, string> = {
  connect_wallet: "Unlocks once a read-only wallet is connected.",
  first_scan: "Unlocks after you open the market scanner once.",
  security_scan: "Unlocks after a wallet security scan finishes.",
  create_alert: "Unlocks once you have at least one alert rule saved.",
  paper_trade: "Unlocks after your first paper trade fills.",
  complete_tour: "Unlocks when you finish the guided tour.",
  refer_friend: "Unlocks once someone signs up with your referral link.",
};
