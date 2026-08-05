import { useCallback, useEffect, useState } from "react";

/**
 * Notification categories the user can filter on from the bell menu.
 * - `risk_block`   — orders stopped by a risk control (limits, drawdown, cash)
 * - `order_status` — order placed / filled / rejected progress
 * - `backtest`     — backtest run started, finished or failed
 */
export type NotifyCategory = "risk_block" | "order_status" | "backtest";

export const NOTIFY_CATEGORIES: {
  value: NotifyCategory;
  label: string;
  hint: string;
}[] = [
  {
    value: "risk_block",
    label: "Risk blocks",
    hint: "Orders stopped by exposure, drawdown or cash limits.",
  },
  {
    value: "order_status",
    label: "Order status",
    hint: "Order placed, filled and rejection updates.",
  },
  {
    value: "backtest",
    label: "Backtest events",
    hint: "Backtest runs finishing, failing or being cancelled.",
  },
];

export const ALL_CATEGORIES: NotifyCategory[] = NOTIFY_CATEGORIES.map((c) => c.value);

const KEY = "pp.notify.categories";
const EVENT = "pp:notify-categories";

function isCategory(v: unknown): v is NotifyCategory {
  return v === "risk_block" || v === "order_status" || v === "backtest";
}

function normalise(list: unknown): NotifyCategory[] {
  if (!Array.isArray(list)) return ALL_CATEGORIES;
  const found = list.filter(isCategory);
  return Array.from(new Set(found));
}

export function readNotifyCategories(): NotifyCategory[] {
  if (typeof window === "undefined") return ALL_CATEGORIES;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return ALL_CATEGORIES;
    return normalise(JSON.parse(raw));
  } catch {
    return ALL_CATEGORIES;
  }
}

export function setNotifyCategories(next: NotifyCategory[]) {
  const value = normalise(next);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — keep the in-memory value only */
  }
  // Notify other subscribers after the current commit so no listener's
  // setState lands while another component is still rendering.
  queueMicrotask(() =>
    window.dispatchEvent(new CustomEvent<NotifyCategory[]>(EVENT, { detail: value })),
  );
}

/** True when notifications of this category are not filtered out. */
export function isCategoryEnabled(
  enabled: NotifyCategory[],
  category?: NotifyCategory,
): boolean {
  if (!category) return true;
  return enabled.includes(category);
}

/** Reactive read of the category filter; syncs across tabs and components. */
export function useNotifyCategories() {
  // Start with everything on so SSR and the first client render agree.
  const [categories, setLocal] = useState<NotifyCategory[]>(ALL_CATEGORIES);

  useEffect(() => {
    setLocal(readNotifyCategories());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<NotifyCategory[]>).detail;
      if (Array.isArray(detail)) setLocal(normalise(detail));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLocal(readNotifyCategories());
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = useCallback(
    (category: NotifyCategory, on: boolean) => {
      // Persist outside the state updater: setNotifyCategories dispatches an
      // event that other subscribers react to, which must not run in render.
      const next = on
        ? Array.from(new Set([...categories, category]))
        : categories.filter((c) => c !== category);
      setLocal(next);
      setNotifyCategories(next);
    },
    [categories],
  );

  const setAll = useCallback((on: boolean) => {
    const next = on ? ALL_CATEGORIES : [];
    setLocal(next);
    setNotifyCategories(next);
  }, []);

  return { categories, toggle, setAll };
}
