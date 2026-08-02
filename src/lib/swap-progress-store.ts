/* ------------------------------------------------------------------ *
 * Persisted swap progress.
 *
 * Keeps the live-swap stepper and transaction hash across page reloads so a
 * refresh (or an accidental tab close) never loses sight of an in-flight
 * trade. Only non-sensitive UI state is stored — never keys or signatures.
 * ------------------------------------------------------------------ */
import { IDLE_PROGRESS, type SwapProgress, type SwapStepId } from "@/components/swap-progress";

const KEY = "pumppilot.swap-progress.v1";
/** Anything older than this is stale enough to discard on load. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface PersistedSwapProgress {
  progress: SwapProgress;
  txHash: string | null;
  chainId: number;
  savedAt: number;
}

const STEPS: SwapStepId[] = ["quote", "approve", "submit", "confirm"];

function isStarted(progress: SwapProgress) {
  return STEPS.some((id) => progress[id]?.status && progress[id].status !== "idle");
}

/** Wallet prompts don't survive a reload, so mid-flight steps can't stay "active". */
function sanitize(progress: SwapProgress, txHash: string | null): SwapProgress {
  const next = { ...IDLE_PROGRESS } as SwapProgress;
  for (const id of STEPS) {
    const state = progress[id];
    if (!state || typeof state.status !== "string") continue;
    if (state.status === "active" && !(id === "confirm" && txHash)) {
      next[id] =
        id === "submit" || id === "approve"
          ? { status: "idle", note: "Interrupted by a page reload — start this step again." }
          : { status: "idle" };
      continue;
    }
    next[id] = { status: state.status, note: state.note };
  }
  return next;
}

export function loadSwapProgress(chainId: number): PersistedSwapProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSwapProgress>;
    if (!parsed?.progress || parsed.chainId !== chainId) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    const txHash = typeof parsed.txHash === "string" ? parsed.txHash : null;
    const progress = sanitize(parsed.progress as SwapProgress, txHash);
    if (!isStarted(progress) && !txHash) return null;
    return { progress, txHash, chainId, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function saveSwapProgress(input: Omit<PersistedSwapProgress, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    if (!isStarted(input.progress) && !input.txHash) {
      window.localStorage.removeItem(KEY);
      return;
    }
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...input, savedAt: Date.now() } satisfies PersistedSwapProgress),
    );
  } catch {
    /* storage full or blocked — progress display is best-effort */
  }
}

export function clearSwapProgress() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
