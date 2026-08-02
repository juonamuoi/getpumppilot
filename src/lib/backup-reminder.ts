/* ------------------------------------------------------------------ *
 * Backup reminder schedule.
 *
 * Keeps nagging (locally, in this browser only) until the wallet's
 * recovery phrase has been confirmed as backed up offline. The schedule
 * survives reloads so a snooze is honoured across sessions.
 * ------------------------------------------------------------------ */

const KEY = "pumppilot.wallet.backup-reminder.v1";

/** First nudge lands shortly after the wallet exists, then repeats. */
export const FIRST_DELAY_MS = 2 * 60 * 1000;
export const REPEAT_MS = 15 * 60 * 1000;

export const SNOOZE_OPTIONS = [
  { id: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { id: "tomorrow", label: "Tomorrow", ms: 24 * 60 * 60 * 1000 },
] as const;

export interface ReminderSchedule {
  /** Epoch ms of the next reminder. */
  nextDueAt: number;
  /** How many reminders have been shown for the current wallet. */
  shown: number;
  /** How many times the user snoozed. */
  snoozed: number;
}

function read(): ReminderSchedule | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReminderSchedule>;
    if (typeof parsed.nextDueAt !== "number") return null;
    return {
      nextDueAt: parsed.nextDueAt,
      shown: parsed.shown ?? 0,
      snoozed: parsed.snoozed ?? 0,
    };
  } catch {
    return null;
  }
}

function write(s: ReminderSchedule) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage denied — reminders stay in memory for this session */
  }
}

/** Returns the live schedule, creating one the first time it is needed. */
export function ensureSchedule(now = Date.now()): ReminderSchedule {
  const existing = read();
  if (existing) return existing;
  const fresh: ReminderSchedule = { nextDueAt: now + FIRST_DELAY_MS, shown: 0, snoozed: 0 };
  write(fresh);
  return fresh;
}

/** Records that a reminder fired and queues the next one. */
export function markShown(now = Date.now()): ReminderSchedule {
  const s = ensureSchedule(now);
  const next: ReminderSchedule = {
    nextDueAt: now + REPEAT_MS,
    shown: s.shown + 1,
    snoozed: s.snoozed,
  };
  write(next);
  return next;
}

/** Pushes the next reminder out by `ms`. */
export function snooze(ms: number, now = Date.now()): ReminderSchedule {
  const s = ensureSchedule(now);
  const next: ReminderSchedule = {
    nextDueAt: now + ms,
    shown: s.shown,
    snoozed: s.snoozed + 1,
  };
  write(next);
  return next;
}

/** Clears the schedule — called once the backup is confirmed or the wallet is removed. */
export function clearSchedule() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Event other components listen for to open the wallet dialog. */
export const OPEN_WALLET_EVENT = "pumppilot:open-wallet";

export function requestOpenWallet() {
  window.dispatchEvent(new CustomEvent(OPEN_WALLET_EVENT));
}
