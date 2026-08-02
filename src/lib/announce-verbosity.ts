import { useCallback, useEffect, useState } from "react";

/**
 * How chatty screen-reader / live-region execution announcements should be.
 * - `off`     — no announcements at all
 * - `minimal` — only outcomes that need attention (fills, rejections, errors)
 * - `full`    — every step, including "order placed / awaiting confirmation"
 */
export type AnnounceVerbosity = "off" | "minimal" | "full";

/** Importance of an individual announcement. */
export type AnnounceImportance = "essential" | "detail";

export const VERBOSITY_OPTIONS: { value: AnnounceVerbosity; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Silence all execution announcements." },
  {
    value: "minimal",
    label: "Minimal",
    hint: "Only fills, rejections and errors — no step-by-step chatter.",
  },
  { value: "full", label: "Full", hint: "Announce every step of an order, including progress." },
];

const KEY = "pp.announce.verbosity";
const EVENT = "pp:announce-verbosity";
const DEFAULT: AnnounceVerbosity = "full";

function isVerbosity(v: unknown): v is AnnounceVerbosity {
  return v === "off" || v === "minimal" || v === "full";
}

export function readAnnounceVerbosity(): AnnounceVerbosity {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    return isVerbosity(raw) ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setAnnounceVerbosity(value: AnnounceVerbosity) {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* storage unavailable — keep the in-memory value only */
  }
  window.dispatchEvent(new CustomEvent<AnnounceVerbosity>(EVENT, { detail: value }));
}

/** True when an announcement of this importance should be read out. */
export function shouldAnnounce(
  verbosity: AnnounceVerbosity,
  importance: AnnounceImportance,
): boolean {
  if (verbosity === "off") return false;
  if (verbosity === "minimal") return importance === "essential";
  return true;
}

/** Reactive read of the stored preference; syncs across tabs and components. */
export function useAnnounceVerbosity() {
  // Start at the default so SSR and first client render match, then hydrate.
  const [verbosity, setLocal] = useState<AnnounceVerbosity>(DEFAULT);

  useEffect(() => {
    setLocal(readAnnounceVerbosity());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<AnnounceVerbosity>).detail;
      if (isVerbosity(detail)) setLocal(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLocal(readAnnounceVerbosity());
    };
    window.addEventListener(EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((value: AnnounceVerbosity) => {
    setLocal(value);
    setAnnounceVerbosity(value);
  }, []);

  return { verbosity, setVerbosity: update };
}
