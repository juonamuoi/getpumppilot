// User-configurable token allowlist / blocklist for spam labeling.
// Stored locally (per browser) — read-only data, no funds implications.
import { useCallback, useEffect, useState } from "react";

export type SpamListKind = "allow" | "block";

export type SpamListEntry = {
  /** Lowercased contract address, or `symbol:XYZ` when no address is known. */
  key: string;
  label: string;
  note?: string;
  addedAt: number;
};

export type SpamListState = {
  allow: SpamListEntry[];
  block: SpamListEntry[];
};

const STORAGE_KEY = "pumppilot.spam-lists.v1";

export const EMPTY_LISTS: SpamListState = { allow: [], block: [] };

export function entryKey(address?: string, symbol?: string): string {
  if (address) return address.toLowerCase();
  return `symbol:${(symbol ?? "").toLowerCase()}`;
}

export function listVerdict(
  lists: SpamListState | undefined,
  address?: string,
  symbol?: string,
): SpamListKind | null {
  if (!lists) return null;
  const keys = [address ? address.toLowerCase() : null, `symbol:${(symbol ?? "").toLowerCase()}`]
    .filter(Boolean) as string[];
  // Blocklist wins over allowlist so a user can't accidentally trust a drainer.
  if (lists.block.some((e) => keys.includes(e.key))) return "block";
  if (lists.allow.some((e) => keys.includes(e.key))) return "allow";
  return null;
}

function read(): SpamListState {
  if (typeof window === "undefined") return EMPTY_LISTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LISTS;
    const parsed = JSON.parse(raw) as Partial<SpamListState>;
    return {
      allow: Array.isArray(parsed.allow) ? parsed.allow : [],
      block: Array.isArray(parsed.block) ? parsed.block : [],
    };
  } catch {
    return EMPTY_LISTS;
  }
}

const listeners = new Set<(s: SpamListState) => void>();

function write(next: SpamListState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode) — keep the in-memory value.
  }
  listeners.forEach((l) => l(next));
}

export function useSpamLists() {
  const [lists, setLists] = useState<SpamListState>(EMPTY_LISTS);

  // Read after mount so SSR and hydration agree.
  useEffect(() => {
    setLists(read());
    const l = (s: SpamListState) => setLists(s);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const add = useCallback((kind: SpamListKind, entry: Omit<SpamListEntry, "addedAt">) => {
    const current = read();
    const clean: SpamListState = {
      allow: current.allow.filter((e) => e.key !== entry.key),
      block: current.block.filter((e) => e.key !== entry.key),
    };
    clean[kind] = [{ ...entry, addedAt: Date.now() }, ...clean[kind]];
    write(clean);
  }, []);

  const remove = useCallback((key: string) => {
    const current = read();
    write({
      allow: current.allow.filter((e) => e.key !== key),
      block: current.block.filter((e) => e.key !== key),
    });
  }, []);

  const clear = useCallback((kind?: SpamListKind) => {
    const current = read();
    if (!kind) return write(EMPTY_LISTS);
    write({ ...current, [kind]: [] });
  }, []);

  return { lists, add, remove, clear };
}
