import { useCallback, useEffect, useState } from "react";
import type { NotifyCategory } from "@/lib/notify-categories";

/** A single entry in the notifications center. */
export type NotificationEntry = {
  id: string;
  message: string;
  /** Undefined for uncategorised/system messages. */
  category?: NotifyCategory;
  /** "assertive" entries are errors/blocks; "polite" is routine progress. */
  level: "polite" | "assertive";
  /** Epoch millis when the notification was raised. */
  ts: number;
  read: boolean;
};

const KEY = "pp.notify.log";
const EVENT = "pp:notify-log";
const MAX = 200;

/** Kept stable so consumers never see a new empty array reference. */
const EMPTY: NotificationEntry[] = [];

function isEntry(v: unknown): v is NotificationEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<NotificationEntry>;
  return (
    typeof e.id === "string" &&
    typeof e.message === "string" &&
    typeof e.ts === "number" &&
    typeof e.read === "boolean"
  );
}

function normalise(list: unknown): NotificationEntry[] {
  if (!Array.isArray(list)) return EMPTY;
  const found = list.filter(isEntry).slice(0, MAX);
  return found.length ? found : EMPTY;
}

export function readNotificationLog(): NotificationEntry[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return normalise(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
}

function write(next: NotificationEntry[]) {
  const value = next.slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — the event still updates live subscribers */
  }
  // Dispatch after the current commit so no listener's setState lands while
  // another component is still rendering.
  queueMicrotask(() =>
    window.dispatchEvent(new CustomEvent<NotificationEntry[]>(EVENT, { detail: value })),
  );
}

function mutate(fn: (prev: NotificationEntry[]) => NotificationEntry[]) {
  if (typeof window === "undefined") return;
  write(fn(readNotificationLog()));
}

/** Append a notification to the center. Newest first. */
export function recordNotification(input: {
  message: string;
  category?: NotifyCategory;
  level?: "polite" | "assertive";
}) {
  if (typeof window === "undefined") return;
  const entry: NotificationEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    message: input.message,
    category: input.category,
    level: input.level ?? "polite",
    ts: Date.now(),
    read: false,
  };
  mutate((prev) => {
    // Collapse an identical message repeated within 2s (re-announcements).
    const head = prev[0];
    if (head && head.message === entry.message && entry.ts - head.ts < 2000) return prev;
    return [entry, ...prev];
  });
}

export function setNotificationRead(id: string, read: boolean) {
  mutate((prev) => prev.map((e) => (e.id === id ? { ...e, read } : e)));
}

export function markAllNotificationsRead(read: boolean) {
  mutate((prev) => prev.map((e) => (e.read === read ? e : { ...e, read })));
}

export function clearNotifications() {
  mutate(() => EMPTY);
}

/** Reactive read of the notification log; syncs across tabs and components. */
export function useNotificationLog() {
  // Start empty so SSR and the first client render agree.
  const [entries, setEntries] = useState<NotificationEntry[]>(EMPTY);

  useEffect(() => {
    setEntries(readNotificationLog());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<NotificationEntry[]>).detail;
      if (Array.isArray(detail)) setEntries(normalise(detail));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setEntries(readNotificationLog());
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const unread = entries.reduce((n, e) => (e.read ? n : n + 1), 0);

  return {
    entries,
    unread,
    setRead: useCallback(setNotificationRead, []),
    markAll: useCallback(markAllNotificationsRead, []),
    clear: useCallback(clearNotifications, []),
  };
}

/** Short relative timestamp, e.g. "just now", "4m ago", "2h ago". */
export function formatNotificationTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
