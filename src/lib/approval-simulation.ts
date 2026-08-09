/* ------------------------------------------------------------------ *
 * Paper-trading simulation for approval overwrites.
 *
 * While the live adapter switch is off (execution mode = paper), every
 * revoke or spending-cap change is recorded here instead of being sent
 * on-chain. Nothing is signed, no wallet prompt appears, and no network
 * fee is paid — the scan results are simply re-projected through the
 * simulated changes so the user can rehearse the exact outcome.
 * ------------------------------------------------------------------ */

import { useStableSyncExternalStore } from "@/lib/snapshot-invariant";
import { getLiveTrading } from "@/lib/live-trading";
import {
  buildOverwriteTx,
  fromBaseUnits,
  toBaseUnitsBig,
  type ApprovalChange,
  type TokenApproval,
} from "@/lib/token-approvals";

const KEY = "pumppilot.approval-sim.v1";
const UINT256_MAX = (1n << 256n) - 1n;
const UNLIMITED_THRESHOLD = (1n << 255n) - 1n;
/** Newest simulations kept per wallet; older ones roll off. */
const MAX_ENTRIES = 200;

export type SimulatedOverwrite = {
  /** Approval id (`kind:contract:spender`). */
  id: string;
  address: string;
  chainId: number;
  symbol: string;
  spender: string;
  change: ApprovalChange;
  /** Allowance in base units after the simulated change (decimal string). */
  nextAllowance: string;
  /** Base-units allowance before the change (decimal string). */
  prevAllowance: string;
  /** The calldata that *would* have been signed. */
  to: string;
  data: string;
  /** Deterministic pseudo hash so the UI can show a receipt-like id. */
  simHash: string;
  at: number;
};

type State = { entries: SimulatedOverwrite[] };

const EMPTY: SimulatedOverwrite[] = [];
let state: State = { entries: EMPTY };
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) state = { entries: parsed as SimulatedOverwrite[] };
  } catch {
    // Corrupt or unavailable storage — start clean rather than crash.
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state.entries));
  } catch {
    // Private mode: simulations stay in memory for this session.
  }
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  hydrate();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSimulations(): SimulatedOverwrite[] {
  hydrate();
  return state.entries;
}

/** All simulated overwrites, newest first. Stable reference between changes. */
export function useApprovalSimulations(): SimulatedOverwrite[] {
  return useStableSyncExternalStore(
    subscribe,
    getSimulations,
    () => EMPTY,
    "approval-simulation",
  );
}

function pseudoHash(seed: string): string {
  // FNV-1a over the seed, expanded to a 32-byte-looking id. Clearly marked
  // as simulated in the UI — it is never a real transaction hash.
  let h = 0x811c9dc5;
  const bytes: string[] = [];
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < seed.length; j++) {
      h ^= seed.charCodeAt(j) + i;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    bytes.push((h & 0xff).toString(16).padStart(2, "0"));
  }
  return `0x${bytes.join("")}`;
}

function nextAllowanceFor(a: TokenApproval, change: ApprovalChange): bigint {
  if (a.kind === "operator") return 0n;
  if (change.type === "revoke") return 0n;
  if (change.type === "unlimited") return UINT256_MAX;
  return toBaseUnitsBig(change.amount, a.decimals);
}

/**
 * Records a simulated overwrite. Builds the exact calldata that live mode
 * would submit, then stores the outcome without touching the network.
 */
export function simulateOverwrite(
  a: TokenApproval,
  change: ApprovalChange,
  from: string,
  chainId: number,
): SimulatedOverwrite {
  hydrate();
  const tx = buildOverwriteTx(a, change, from);
  const at = Date.now();
  const entry: SimulatedOverwrite = {
    id: a.id,
    address: from.toLowerCase(),
    chainId,
    symbol: a.symbol,
    spender: a.spender,
    change,
    prevAllowance: a.allowance.toString(),
    nextAllowance: nextAllowanceFor(a, change).toString(),
    to: tx.to,
    data: tx.data,
    simHash: pseudoHash(`${a.id}:${tx.data}:${at}`),
    at,
  };
  state = { entries: [entry, ...state.entries].slice(0, MAX_ENTRIES) };
  persist();
  emit();
  return entry;
}

/** Drops one simulated change (undo). */
export function clearSimulation(id: string, address: string) {
  hydrate();
  const owner = address.toLowerCase();
  const next = state.entries.filter((e) => !(e.id === id && e.address === owner));
  if (next.length === state.entries.length) return;
  state = { entries: next };
  persist();
  emit();
}

/** Drops every simulated change for a wallet (reset to the on-chain truth). */
export function clearSimulations(address?: string) {
  hydrate();
  const owner = address?.toLowerCase();
  const next = owner ? state.entries.filter((e) => e.address !== owner) : [];
  state = { entries: next };
  persist();
  emit();
}

/** Most recent simulation per approval id for this wallet + chain. */
export function latestByApproval(
  entries: SimulatedOverwrite[],
  address: string | null,
  chainId: number | undefined,
): Map<string, SimulatedOverwrite> {
  const out = new Map<string, SimulatedOverwrite>();
  if (!address) return out;
  const owner = address.toLowerCase();
  for (const e of entries) {
    if (e.address !== owner) continue;
    if (chainId !== undefined && e.chainId !== chainId) continue;
    const prev = out.get(e.id);
    if (!prev || e.at > prev.at) out.set(e.id, e);
  }
  return out;
}

export type ProjectedApproval = TokenApproval & {
  /** Set when a paper simulation changed this grant. */
  simulated?: SimulatedOverwrite;
};

/**
 * Re-projects a live scan through the recorded simulations so paper mode
 * shows the state the wallet *would* be in. Grants simulated down to zero
 * (or operator flags turned off) drop out of the list, exactly as they
 * would after a real revoke.
 */
export function projectApprovals(
  approvals: TokenApproval[],
  sims: Map<string, SimulatedOverwrite>,
): ProjectedApproval[] {
  if (sims.size === 0) return approvals;
  const out: ProjectedApproval[] = [];
  for (const a of approvals) {
    const sim = sims.get(a.id);
    if (!sim) {
      out.push(a);
      continue;
    }
    let next: bigint;
    try {
      next = BigInt(sim.nextAllowance);
    } catch {
      next = a.allowance;
    }
    if (next === 0n) continue; // fully revoked in the simulation
    out.push({
      ...a,
      allowance: next,
      allowanceAmount: fromBaseUnits(next, a.decimals),
      unlimited: next >= UNLIMITED_THRESHOLD,
      simulated: sim,
    });
  }
  return out;
}

/** True while approval writes must stay simulated (live adapter switch off). */
export function approvalsAreSimulated(): boolean {
  return getLiveTrading().mode !== "live";
}
