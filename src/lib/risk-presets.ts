/**
 * Named risk-control presets, persisted per browser so you can switch
 * guardrail profiles quickly from anywhere in the app.
 */
import { useCallback, useEffect, useState } from "react";

export type RiskSettings = {
  maxPositionPct: number;
  maxDailyLossPct: number;
  stopLossPct: number;
  takeProfitPct: number;
};

export type RiskPreset = {
  id: string;
  name: string;
  settings: RiskSettings;
  builtIn?: boolean;
  updatedAt: string;
};

const KEY = "pumppilot.risk-presets.v1";
const ACTIVE_KEY = "pumppilot.risk-presets.active.v1";
const EVT = "pumppilot:risk-presets";

export const BUILT_IN_PRESETS: RiskPreset[] = [
  {
    id: "builtin-conservative",
    name: "Conservative",
    builtIn: true,
    updatedAt: "",
    settings: { maxPositionPct: 10, maxDailyLossPct: 3, stopLossPct: 5, takeProfitPct: 12 },
  },
  {
    id: "builtin-balanced",
    name: "Balanced",
    builtIn: true,
    updatedAt: "",
    settings: { maxPositionPct: 25, maxDailyLossPct: 5, stopLossPct: 8, takeProfitPct: 20 },
  },
  {
    id: "builtin-aggressive",
    name: "Aggressive",
    builtIn: true,
    updatedAt: "",
    settings: { maxPositionPct: 40, maxDailyLossPct: 10, stopLossPct: 14, takeProfitPct: 45 },
  },
];

export function sameRisk(a: RiskSettings, b: RiskSettings) {
  return (
    a.maxPositionPct === b.maxPositionPct &&
    a.maxDailyLossPct === b.maxDailyLossPct &&
    a.stopLossPct === b.stopLossPct &&
    a.takeProfitPct === b.takeProfitPct
  );
}

function readCustom(): RiskPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RiskPreset[]) : [];
  } catch {
    return [];
  }
}

function writeCustom(list: RiskPreset[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — presets stay in memory for this session */
  }
  window.dispatchEvent(new Event(EVT));
}

function readActive(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/** Reactive access to presets, shared across every mounted component. */
export function useRiskPresets() {
  const [custom, setCustom] = useState<RiskPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setCustom(readCustom());
      setActiveId(readActive());
    };
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const presets = [...BUILT_IN_PRESETS, ...custom];

  const savePreset = useCallback((name: string, settings: RiskSettings) => {
    const list = readCustom();
    const trimmed = name.trim();
    const existing = list.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    const preset: RiskPreset = existing
      ? { ...existing, settings, updatedAt: new Date().toISOString() }
      : {
          id: `p_${Date.now().toString(36)}`,
          name: trimmed,
          settings,
          updatedAt: new Date().toISOString(),
        };
    writeCustom(existing ? list.map((p) => (p.id === preset.id ? preset : p)) : [...list, preset]);
    return preset;
  }, []);

  const renamePreset = useCallback((id: string, name: string) => {
    writeCustom(
      readCustom().map((p) =>
        p.id === id ? { ...p, name: name.trim(), updatedAt: new Date().toISOString() } : p,
      ),
    );
  }, []);

  const deletePreset = useCallback((id: string) => {
    writeCustom(readCustom().filter((p) => p.id !== id));
    if (readActive() === id) markActive(null);
  }, []);

  const markActive = (id: string | null) => {
    try {
      if (id) window.localStorage.setItem(ACTIVE_KEY, id);
      else window.localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVT));
  };

  return {
    presets,
    customPresets: custom,
    activeId,
    savePreset,
    renamePreset,
    deletePreset,
    markActive,
  };
}
