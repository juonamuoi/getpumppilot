/* ------------------------------------------------------------------ *
 * Token approval control.
 *
 * Every "contract signing" you have granted on another platform (a DEX,
 * an NFT marketplace, a bridge, a random airdrop site) lives on-chain as
 * an ERC-20 `approve` allowance or an ERC-721/1155 `setApprovalForAll`
 * flag. Those grants keep working forever until the owner overwrites
 * them — and only the owner's wallet can do that.
 *
 * This module finds those grants for the connected account and builds the
 * transactions that overwrite them: revoke (set to zero) or cap to a
 * specific amount. Reads are eth_getLogs + eth_call. The only write is a
 * transaction the user signs in their own wallet. No seed phrases, ever.
 * ------------------------------------------------------------------ */

import { useQuery } from "@tanstack/react-query";
import { getInjectedProvider } from "@/lib/wallet-balances";
import { getLiveTrading } from "@/lib/live-trading";


/** keccak256("Approval(address,address,uint256)") */
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
/** keccak256("ApprovalForAll(address,address,bool)") */
const APPROVAL_FOR_ALL_TOPIC =
  "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31";

const UINT256_MAX = (1n << 256n) - 1n;
/** Anything above this is presented as effectively unlimited. */
const UNLIMITED_THRESHOLD = (1n << 255n) - 1n;

/** Blocks of history scanned for approval events (~2 weeks on most chains). */
const SCAN_BLOCKS = 120_000;
const CHUNK_BLOCKS = 20_000;
const MIN_CHUNK_BLOCKS = 1_000;
const CHUNK_CONCURRENCY = 4;
/** Hard cap so a busy wallet can't fire hundreds of eth_calls. */
const MAX_GRANTS = 60;

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export type ApprovalKind = "erc20" | "operator";

export type TokenApproval = {
  id: string;
  kind: ApprovalKind;
  /** Token / collection contract. */
  contract: string;
  /** Token symbol when readable. */
  symbol: string;
  /** Contract name when readable. */
  name: string;
  decimals: number;
  /** The platform that can move these assets. */
  spender: string;
  /** Raw allowance in base units (erc20) — 1n means "operator enabled". */
  allowance: bigint;
  /** Human-readable allowance for ERC-20s. */
  allowanceAmount: number;
  /** Allowance is effectively infinite. */
  unlimited: boolean;
  /** Owner's current balance at risk, in human units. */
  balance: number;
  /** Block of the most recent grant we saw. */
  lastBlock: number;
  /* ---- provenance: where this row came from ---- */
  /** Chain the grant lives on. */
  chainId: number;
  /** Transaction that emitted the grant event, when the RPC returned it. */
  txHash: string | null;
  /** How the entry was discovered. */
  source: ApprovalSource;
  /** Epoch ms of the scan that produced this row. */
  scannedAt: number;
};

/** Provenance of an approval row. */
export type ApprovalSource = "onchain-log-scan" | "paper-simulation";

export type ApprovalRisk = "critical" | "high" | "medium" | "low";

export type ApprovalScan = {
  address: string;
  chainId: number;
  approvals: TokenApproval[];
  /** Blocks actually scanned. */
  scannedBlocks: number;
  /** First block covered by the scan. */
  fromBlock: number;
  /** Latest block at scan time. */
  toBlock: number;
  /** Epoch ms the scan completed. */
  scannedAt: number;
  /** Where the reads came from — always the user's own wallet RPC. */
  rpc: "injected-wallet";
  /** True when the RPC refused log scans on this network. */
  scanFailed: boolean;
};

/* ---------------------------- encoding ---------------------------- */

function pad32(value: string): string {
  return value.toLowerCase().replace("0x", "").padStart(64, "0");
}

function addressFromTopic(topic: string): string {
  return `0x${topic.slice(-40)}`;
}

function hexToBigInt(hex: unknown): bigint {
  if (typeof hex !== "string" || !hex.startsWith("0x") || hex === "0x") return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

function decodeAbiString(hex: unknown): string | null {
  if (typeof hex !== "string" || hex.length < 3) return null;
  const body = hex.replace("0x", "");
  const readable = (h: string) =>
    (h.match(/.{1,2}/g) ?? [])
      .map((b) => parseInt(b, 16))
      .filter((c) => c >= 32 && c < 127)
      .map((c) => String.fromCharCode(c))
      .join("");
  if (body.length >= 128) {
    const len = parseInt(body.slice(64, 128), 16);
    if (len > 0 && len <= 64) {
      const s = readable(body.slice(128, 128 + len * 2)).trim();
      if (s) return s;
    }
  }
  const s = readable(body.slice(0, 64)).trim();
  return s || null;
}

/** Human decimal string -> base units, without floating point drift. */
export function toBaseUnitsBig(amount: string, decimals: number): bigint {
  const trimmed = (amount || "0").trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") return 0n;
  const [whole = "0", frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(`${whole || "0"}${padded || ""}` || "0");
}

export function fromBaseUnits(value: bigint, decimals: number): number {
  if (decimals <= 0) return Number(value);
  const s = value.toString().padStart(decimals + 1, "0");
  return Number(`${s.slice(0, -decimals)}.${s.slice(-decimals)}`);
}

/** `approve(spender, amount)` calldata. */
export function encodeApprove(spender: string, amount: bigint): string {
  return `0x095ea7b3${pad32(spender)}${amount.toString(16).padStart(64, "0")}`;
}

/** `setApprovalForAll(operator, approved)` calldata. */
export function encodeSetApprovalForAll(operator: string, approved: boolean): string {
  return `0xa22cb465${pad32(operator)}${(approved ? 1 : 0).toString(16).padStart(64, "0")}`;
}

/* ------------------------------ reads ------------------------------ */

async function call(provider: Eip1193, to: string, data: string): Promise<unknown> {
  return provider.request({ method: "eth_call", params: [{ to, data }, "latest"] });
}

type RawLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
};

async function getLogsChunked(
  provider: Eip1193,
  filter: Record<string, unknown>,
  fromBlock: number,
  toBlock: number,
  span: number,
): Promise<RawLog[]> {
  const ranges: [number, number][] = [];
  for (let start = fromBlock; start <= toBlock; start += span) {
    ranges.push([start, Math.min(start + span - 1, toBlock)]);
  }

  const out: RawLog[] = [];
  let anyOk = false;

  for (let i = 0; i < ranges.length; i += CHUNK_CONCURRENCY) {
    const batch = ranges.slice(i, i + CHUNK_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ([a, b]) => {
        try {
          const logs = (await provider.request({
            method: "eth_getLogs",
            params: [
              { fromBlock: `0x${a.toString(16)}`, toBlock: `0x${b.toString(16)}`, ...filter },
            ],
          })) as RawLog[];
          return { ok: true, logs: logs ?? [], range: [a, b] as [number, number] };
        } catch {
          return { ok: false, logs: [] as RawLog[], range: [a, b] as [number, number] };
        }
      }),
    );

    for (const r of results) {
      if (r.ok) {
        anyOk = true;
        out.push(...r.logs);
        continue;
      }
      if (span > MIN_CHUNK_BLOCKS) {
        const sub = await getLogsChunked(
          provider,
          filter,
          r.range[0],
          r.range[1],
          Math.max(MIN_CHUNK_BLOCKS, Math.floor(span / 2)),
        );
        anyOk = true;
        out.push(...sub);
      }
    }
  }

  if (!anyOk) throw new Error("approval log scan unavailable");
  return out;
}

/**
 * Finds every live approval the connected account has granted: ERC-20
 * allowances and NFT operator flags. Read-only.
 */
export async function scanApprovals(address: string): Promise<ApprovalScan> {
  const provider = getInjectedProvider() as Eip1193 | null;
  if (!provider) throw new Error("No wallet connected");

  const chainId = Number(hexToBigInt(await provider.request({ method: "eth_chainId" })));
  const head = Number(hexToBigInt(await provider.request({ method: "eth_blockNumber" })));
  const fromBlock = Math.max(0, head - SCAN_BLOCKS);
  const ownerTopic = `0x${pad32(address)}`;

  let logs: RawLog[] = [];
  let scanFailed = false;
  try {
    const [erc20Logs, operatorLogs] = await Promise.all([
      getLogsChunked(provider, { topics: [APPROVAL_TOPIC, ownerTopic] }, fromBlock, head, CHUNK_BLOCKS),
      getLogsChunked(
        provider,
        { topics: [APPROVAL_FOR_ALL_TOPIC, ownerTopic] },
        fromBlock,
        head,
        CHUNK_BLOCKS,
      ),
    ]);
    logs = [...erc20Logs, ...operatorLogs];
  } catch {
    scanFailed = true;
  }

  // Latest grant wins per (contract, spender, kind).
  const latest = new Map<string, { log: RawLog; kind: ApprovalKind; block: number }>();
  for (const log of logs) {
    const contract = log.address?.toLowerCase();
    const topics = log.topics ?? [];
    if (!contract || topics.length < 3) continue;
    // ERC-721 single-token Approval has 4 topics (tokenId indexed) — skip it:
    // revoking one token id is not the durable grant users care about.
    const isOperator = topics[0]?.toLowerCase() === APPROVAL_FOR_ALL_TOPIC;
    if (!isOperator && topics.length !== 3) continue;
    const kind: ApprovalKind = isOperator ? "operator" : "erc20";
    const spender = addressFromTopic(topics[2] ?? "");
    const block = Number(hexToBigInt(log.blockNumber));
    const key = `${kind}:${contract}:${spender}`;
    const prev = latest.get(key);
    if (!prev || block >= prev.block) latest.set(key, { log, kind, block });
  }

  const candidates = [...latest.entries()]
    .sort((a, b) => b[1].block - a[1].block)
    .slice(0, MAX_GRANTS);

  const approvals: TokenApproval[] = [];
  for (const [key, { log, kind, block }] of candidates) {
    const contract = String(log.address).toLowerCase();
    const spender = addressFromTopic(log.topics?.[2] ?? "");
    try {
      if (kind === "operator") {
        // isApprovedForAll(owner, operator)
        const res = await call(
          provider,
          contract,
          `0xe985e9c5${pad32(address)}${pad32(spender)}`,
        );
        if (hexToBigInt(res) !== 1n) continue;
        const name = decodeAbiString(await call(provider, contract, "0x06fdde03").catch(() => null));
        const symbol = decodeAbiString(await call(provider, contract, "0x95d89b41").catch(() => null));
        approvals.push({
          id: key,
          kind,
          contract,
          symbol: symbol ?? "NFT",
          name: name ?? "Collection",
          decimals: 0,
          spender,
          allowance: 1n,
          allowanceAmount: 0,
          unlimited: true,
          balance: 0,
          lastBlock: block,
        });
        continue;
      }

      // allowance(owner, spender)
      const allowance = hexToBigInt(
        await call(provider, contract, `0xdd62ed3e${pad32(address)}${pad32(spender)}`),
      );
      if (allowance === 0n) continue;

      const decimalsRaw = hexToBigInt(await call(provider, contract, "0x313ce567").catch(() => null));
      const decimals = Number(decimalsRaw) > 0 && Number(decimalsRaw) <= 36 ? Number(decimalsRaw) : 18;
      const symbol = decodeAbiString(await call(provider, contract, "0x95d89b41").catch(() => null));
      const name = decodeAbiString(await call(provider, contract, "0x06fdde03").catch(() => null));
      const balance = hexToBigInt(
        await call(provider, contract, `0x70a08231${pad32(address)}`).catch(() => null),
      );

      approvals.push({
        id: key,
        kind,
        contract,
        symbol: symbol ?? "Token",
        name: name ?? "Unknown token",
        decimals,
        spender,
        allowance,
        allowanceAmount: fromBaseUnits(allowance, decimals),
        unlimited: allowance >= UNLIMITED_THRESHOLD,
        balance: fromBaseUnits(balance, decimals),
        lastBlock: block,
      });
    } catch {
      // A contract that doesn't answer standard calls is skipped rather than
      // shown with fabricated values.
    }
  }

  approvals.sort((a, b) => riskScore(b) - riskScore(a) || b.lastBlock - a.lastBlock);

  return {
    address,
    chainId,
    approvals,
    scannedBlocks: head - fromBlock,
    scanFailed,
  };
}

/** Value the spender can pull right now, in tokens. */
export function exposureAmount(a: TokenApproval): number {
  if (a.kind === "operator") return 0;
  return Math.min(a.allowanceAmount, a.balance);
}

export function riskOf(a: TokenApproval): ApprovalRisk {
  if (a.kind === "operator") return "critical";
  if (a.unlimited && a.balance > 0) return "critical";
  if (a.unlimited) return "high";
  if (exposureAmount(a) > 0) return "medium";
  return "low";
}

function riskScore(a: TokenApproval): number {
  return { critical: 3, high: 2, medium: 1, low: 0 }[riskOf(a)];
}

export const RISK_LABEL: Record<ApprovalRisk, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Plain-English reason the grant is rated the way it is. */
export function riskReason(a: TokenApproval): string {
  if (a.kind === "operator")
    return "This platform can transfer every item in the collection, including ones you buy later.";
  if (a.unlimited && a.balance > 0)
    return "Unlimited allowance and you hold a balance — the platform can move all of it at any time.";
  if (a.unlimited) return "Unlimited allowance. It applies to any balance you receive later.";
  if (exposureAmount(a) > 0)
    return "Capped allowance, but the platform can still move part of your current balance.";
  return "Allowance is above zero but you hold no balance for this token right now.";
}

/* ------------------------------ writes ------------------------------ */

export type ApprovalChange =
  | { type: "revoke" }
  | { type: "limit"; amount: string }
  | { type: "unlimited" };

/** The exact transaction that overwrites an existing grant. */
export function buildOverwriteTx(
  a: TokenApproval,
  change: ApprovalChange,
  from: string,
): { from: string; to: string; data: string } {
  if (a.kind === "operator") {
    if (change.type !== "revoke") {
      throw new Error("Collection-wide access can only be turned off, not capped.");
    }
    return { from, to: a.contract, data: encodeSetApprovalForAll(a.spender, false) };
  }
  const amount =
    change.type === "revoke"
      ? 0n
      : change.type === "unlimited"
        ? UINT256_MAX
        : toBaseUnitsBig(change.amount, a.decimals);
  return { from, to: a.contract, data: encodeApprove(a.spender, amount) };
}

/**
 * Sends the overwrite. The user signs it in their own wallet; PumpPilot
 * never holds the key.
 */
export async function submitOverwrite(
  a: TokenApproval,
  change: ApprovalChange,
  from: string,
): Promise<string> {
  // Hard gate: while the live adapter switch is off, no approval write may
  // ever reach the chain. Paper mode goes through simulateOverwrite instead.
  if (getLiveTrading().mode !== "live") {
    throw new Error(
      "Paper mode is on — approval changes are simulated. Turn on live execution to sign for real.",
    );
  }
  const provider = getInjectedProvider() as Eip1193 | null;
  if (!provider) throw new Error("No wallet connected");

  const tx = buildOverwriteTx(a, change, from);
  const hash = await provider.request({ method: "eth_sendTransaction", params: [tx] });
  return String(hash);
}

/** Live approval scan for the connected account. */
export function useApprovalScan(address: string | null) {
  return useQuery({
    queryKey: ["token-approvals", address],
    queryFn: () => scanApprovals(address as string),
    enabled: Boolean(address),
    staleTime: 60_000,
    retry: 1,
  });
}
