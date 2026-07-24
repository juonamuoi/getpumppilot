import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type RiskProfile = "conservative" | "balanced" | "aggressive";

export type OnboardingState = {
  completed: boolean;
  name: string;
  riskProfile: RiskProfile;
  goals: string[];
};

const KEY = "pumppilot.onboarding.v1";

const DEFAULT: OnboardingState = {
  completed: false,
  name: "",
  riskProfile: "balanced",
  goals: [],
};

type Ctx = {
  state: OnboardingState;
  save: (s: Partial<OnboardingState>) => void;
  reset: () => void;
  complete: (s: Partial<OnboardingState>) => void;
};

const C = createContext<Ctx | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...DEFAULT, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const value: Ctx = {
    state,
    save: (s) => setState((prev) => ({ ...prev, ...s })),
    reset: () => setState(DEFAULT),
    complete: (s) => setState((prev) => ({ ...prev, ...s, completed: true })),
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useOnboarding() {
  const v = useContext(C);
  if (!v) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return v;
}

export const RISK_PROFILES: Record<
  RiskProfile,
  { label: string; blurb: string; maxPositionPct: number; stopLossPct: number; takeProfitPct: number }
> = {
  conservative: {
    label: "Conservative",
    blurb: "Small positions, tight stops. Prioritize capital preservation.",
    maxPositionPct: 10,
    stopLossPct: 5,
    takeProfitPct: 12,
  },
  balanced: {
    label: "Balanced",
    blurb: "Moderate sizing with sensible stops. A good starting point.",
    maxPositionPct: 20,
    stopLossPct: 8,
    takeProfitPct: 20,
  },
  aggressive: {
    label: "Aggressive",
    blurb: "Larger positions, wider stops. Higher potential reward and risk.",
    maxPositionPct: 35,
    stopLossPct: 12,
    takeProfitPct: 35,
  },
};
