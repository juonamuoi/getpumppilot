import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type TourStep = {
  id: string;
  /** Route the step lives on. The tour navigates there automatically. */
  path: "/paper" | "/risk";
  /** data-tour attribute of the element to spotlight. Omit for a centered card. */
  anchor?: string;
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    path: "/paper",
    title: "You're in paper mode — always",
    body: "Every order in PumpPilot AI is simulated against demo prices. Nothing leaves your browser, no exchange is contacted, and no real money can be lost.",
  },
  {
    id: "paper-lock",
    path: "/paper",
    anchor: "paper-live-lock",
    title: "Live execution is locked off",
    body: "The master switch is disabled at the build level, so paper mode can't be turned off by accident. We never ask for seed phrases or private keys.",
  },
  {
    id: "paper-balances",
    path: "/paper",
    anchor: "paper-balances",
    title: "Your simulated account",
    body: "Equity, cash and open positions all start from a demo balance. Reset it any time from the Positions card to start a fresh practice run.",
  },
  {
    id: "paper-order",
    path: "/paper",
    anchor: "paper-order",
    title: "Placing a practice order",
    body: "Pick an asset, enter a quantity and hit Buy or Sell. Orders are checked against your risk controls before they fill — if a size breaks a limit, it is rejected and explained.",
  },
  {
    id: "paper-history",
    path: "/paper",
    anchor: "paper-trades",
    title: "Review what you did",
    body: "Every simulated fill is logged here and in your Trade Journal, so you can judge a strategy on its record rather than on memory.",
  },
  {
    id: "risk-limits",
    path: "/risk",
    anchor: "risk-limits",
    title: "Guardrails on every order",
    body: "Max position size caps how much of your equity a single asset can take. Max daily loss halts new orders once the day's drawdown hits your ceiling.",
  },
  {
    id: "risk-exits",
    path: "/risk",
    anchor: "risk-limits",
    title: "Stop-loss and take-profit",
    body: "These defaults define your planned exit before you enter. Tightening the stop reduces the loss per trade but increases how often you get stopped out.",
  },
  {
    id: "risk-save",
    path: "/risk",
    anchor: "risk-save",
    title: "Save to apply",
    body: "Changes only take effect once saved. They then apply to new paper orders, backtests and strategy checks across the app.",
  },
  {
    id: "risk-live",
    path: "/risk",
    anchor: "risk-live-lock",
    title: "Why live trading stays off",
    body: "The exchange adapter is a disabled stub. Momentum scores are probabilistic signals — not predictions. Real markets can lose you all of your capital, so practise here first.",
  },
];

const KEY = "pumppilot.tour.paper-risk.v1";

type Ctx = {
  active: boolean;
  index: number;
  step: TourStep | null;
  total: number;
  seen: boolean;
  start: () => void;
  next: () => void;
  prev: () => void;
  stop: (markSeen?: boolean) => void;
};

const C = createContext<Ctx | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState(true); // assume seen until hydrated, avoids SSR flash

  useEffect(() => {
    try {
      setSeen(localStorage.getItem(KEY) === "done");
    } catch {
      /* ignore */
    }
  }, []);

  const markSeenNow = useCallback(() => {
    setSeen(true);
    try {
      localStorage.setItem(KEY, "done");
    } catch {
      /* ignore */
    }
  }, []);

  const stop = useCallback(
    (mark = true) => {
      setActive(false);
      setIndex(0);
      if (mark) markSeenNow();
    },
    [markSeenNow],
  );

  const value = useMemo<Ctx>(
    () => ({
      active,
      index,
      step: active ? (TOUR_STEPS[index] ?? null) : null,
      total: TOUR_STEPS.length,
      seen,
      start: () => {
        setIndex(0);
        setActive(true);
      },
      next: () =>
        setIndex((i) => {
          if (i >= TOUR_STEPS.length - 1) {
            setActive(false);
            markSeenNow();
            return 0;
          }
          return i + 1;
        }),
      prev: () => setIndex((i) => Math.max(0, i - 1)),
      stop,
    }),
    [active, index, seen, stop, markSeenNow],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useTour() {
  const v = useContext(C);
  if (!v) throw new Error("useTour must be used inside TourProvider");
  return v;
}
