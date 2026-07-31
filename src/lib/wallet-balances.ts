/* ------------------------------------------------------------------ *
 * Read-only wallet balance reader.
 *
 * Uses the browser's injected EIP-1193 provider (MetaMask, Rabby,
 * Coinbase Wallet, Brave…) to read the connected account's balances.
 * READ-ONLY: we only ever call eth_accounts / eth_getBalance / eth_call.
 * No signing, no approvals, no transactions, and never a seed phrase.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: never[]) => void) => void;
  removeListener?: (event: string, cb: (...args: never[]) => void) => void;
};

export function getInjectedProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return eth && typeof eth.request === "function" ? eth : null;
}

/** Native coin per chain, mapped onto our live-price symbols. */
const NATIVE_BY_CHAIN: Record<number, { symbol: string; name: string; decimals: number }> = {
  1: { symbol: "ETH", name: "Ethereum", decimals: 18 },
  56: { symbol: "BNB", name: "BNB Chain", decimals: 18 },
  8453: { symbol: "ETH", name: "Ethereum (Base)", decimals: 18 },
  42161: { symbol: "ETH", name: "Ethereum (Arbitrum)", decimals: 18 },
  10: { symbol: "ETH", name: "Ethereum (Optimism)", decimals: 18 },
  43114: { symbol: "AVAX", name: "Avalanche", decimals: 18 },
};

/** ERC-20s we read per chain. Priced from the live feed (USD stables = $1). */
const TOKENS_BY_CHAIN: Record<
  number,
  { symbol: string; name: string; address: string; decimals: number; usdPeg?: number }[]
> = {
  1: [
    {
      symbol: "LINK",
      name: "Chainlink",
      address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
      decimals: 18,
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      usdPeg: 1,
    },
    {
      symbol: "USDT",
      name: "Tether",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
      usdPeg: 1,
    },
  ],
  56: [
    {
      symbol: "USDT",
      name: "Tether",
      address: "0x55d398326f99059fF775485246999027B3197955",
      decimals: 18,
      usdPeg: 1,
    },
  ],
};

export type WalletBalance = {
  symbol: string;
  name: string;
  /** Human-readable token amount. */
  amount: number;
  /** Fixed USD price for pegged stablecoins; otherwise priced from the live feed. */
  usdPeg?: number;
  kind: "native" | "erc20";
  /** Contract address for ERC-20s. */
  address?: string;
  /** True when the token was auto-detected on-chain rather than pre-configured. */
  discovered?: boolean;
  /** Token decimals, used for the balance breakdown in the info drawer. */
  decimals?: number;
};

export type WalletBalances = {
  address: string;
  chainId: number;
  chainName: string;
  balances: WalletBalance[];
  /** True when auto-detection of extra ERC-20s could not run on this network. */
  discoveryFailed?: boolean;
};


const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  43114: "Avalanche",
};

function hexToNumber(hex: unknown): bigint {
  if (typeof hex !== "string" || !hex.startsWith("0x")) return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

function toAmount(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/* ----------------------- ERC-20 auto-detection ---------------------- *
 * Discovery is read-only: we scan recent Transfer logs involving the
 * account, then call balanceOf/symbol/decimals on each contract found.
 * No signing, no approvals — eth_getLogs + eth_call only.
 * ------------------------------------------------------------------- */

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** Blocks of history scanned for token activity (~2 weeks on most chains). */
const SCAN_BLOCKS = 100_000;
/** Hard cap so a busy wallet can't fire hundreds of eth_calls. */
const MAX_DISCOVERED = 24;

function pad32(address: string): string {
  return `0x${address.toLowerCase().replace("0x", "").padStart(64, "0")}`;
}

function decodeAbiString(hex: unknown): string | null {
  if (typeof hex !== "string" || hex.length < 3) return null;
  const body = hex.replace("0x", "");
  const bytes = (h: string) =>
    (h.match(/.{1,2}/g) ?? [])
      .map((b) => parseInt(b, 16))
      .filter((c) => c >= 32 && c < 127)
      .map((c) => String.fromCharCode(c))
      .join("");
  // Dynamic string: offset, length, data.
  if (body.length >= 128) {
    const len = parseInt(body.slice(64, 128), 16);
    if (len > 0 && len <= 64) {
      const s = bytes(body.slice(128, 128 + len * 2)).trim();
      if (s) return s;
    }
  }
  // bytes32 fallback.
  const s = bytes(body.slice(0, 64)).trim();
  return s || null;
}

async function call(
  provider: Eip1193,
  to: string,
  data: string,
): Promise<unknown> {
  return provider.request({ method: "eth_call", params: [{ to, data }, "latest"] });
}

/** Contract addresses this account has sent or received ERC-20 transfers with. */
async function discoverTokenContracts(
  provider: Eip1193,
  address: string,
): Promise<string[]> {
  const latest = Number(hexToNumber(await provider.request({ method: "eth_blockNumber" })));
  const from = Math.max(0, latest - SCAN_BLOCKS);
  const fromBlock = `0x${from.toString(16)}`;
  const topic = pad32(address);

  const queries = [
    { topics: [TRANSFER_TOPIC, null, topic] }, // incoming
    { topics: [TRANSFER_TOPIC, topic] }, // outgoing
  ];

  const found = new Set<string>();
  let ok = false;

  for (const q of queries) {
    try {
      const logs = (await provider.request({
        method: "eth_getLogs",
        params: [{ fromBlock, toBlock: "latest", ...q }],
      })) as { address?: string }[];
      ok = true;
      for (const l of logs ?? []) {
        if (l?.address) found.add(l.address.toLowerCase());
      }
    } catch {
      // RPC may cap log ranges or disable eth_getLogs entirely.
    }
  }

  if (!ok) throw new Error("log scan unavailable");
  return [...found];
}

/** Reads symbol/decimals/balanceOf for a discovered contract. */
async function readDiscoveredToken(
  provider: Eip1193,
  contract: string,
  address: string,
): Promise<WalletBalance | null> {
  const rawBal = hexToNumber(
    await call(provider, contract, `0x70a08231${pad32(address).slice(2)}`),
  );
  if (rawBal === 0n) return null;

  const [symRes, decRes] = await Promise.all([
    call(provider, contract, "0x95d89b41").catch(() => null), // symbol()
    call(provider, contract, "0x313ce567").catch(() => null), // decimals()
  ]);

  const decimals = Number(hexToNumber(decRes));
  const dec = Number.isFinite(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
  const symbol = decodeAbiString(symRes) ?? `${contract.slice(0, 6)}…`;
  const amount = toAmount(rawBal, dec);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    symbol,
    name: symbol,
    amount,
    kind: "erc20",
    address: contract,
    discovered: true,
    decimals: dec,
  };
}

async function readBalances(address: string): Promise<WalletBalances> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No browser wallet detected");

  const chainId = Number(hexToNumber(await provider.request({ method: "eth_chainId" })));
  const native = NATIVE_BY_CHAIN[chainId];

  const balances: WalletBalance[] = [];

  if (native) {
    const raw = hexToNumber(
      await provider.request({ method: "eth_getBalance", params: [address, "latest"] }),
    );
    const amount = toAmount(raw, native.decimals);
    if (amount > 0) balances.push({ ...native, amount, kind: "native" });
  }

  const known = TOKENS_BY_CHAIN[chainId] ?? [];
  const seen = new Set(known.map((t) => t.address.toLowerCase()));

  for (const t of known) {
    try {
      const raw = hexToNumber(
        await call(provider, t.address, `0x70a08231${pad32(address).slice(2)}`),
      );
      const amount = toAmount(raw, t.decimals);
      if (amount > 0) {
        balances.push({
          symbol: t.symbol,
          name: t.name,
          amount,
          usdPeg: t.usdPeg,
          kind: "erc20",
          address: t.address,
          decimals: t.decimals,
        });
      }
    } catch {
      // A token read failing must never break the whole portfolio.
    }
  }

  // Auto-detect any other ERC-20 the wallet has touched recently.
  let discoveryFailed = false;
  try {
    const contracts = (await discoverTokenContracts(provider, address))
      .filter((c) => !seen.has(c))
      .slice(0, MAX_DISCOVERED);

    const results = await Promise.allSettled(
      contracts.map((c) => readDiscoveredToken(provider, c, address)),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) balances.push(r.value);
    }
  } catch {
    discoveryFailed = true;
  }

  return {
    address,
    chainId,
    chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
    balances,
    discoveryFailed,
  };
}


/** Tracks the injected wallet's currently authorised account (read-only). */
export function useInjectedAccount() {
  const [address, setAddress] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const provider = getInjectedProvider();
    setAvailable(Boolean(provider));
    if (!provider) return;

    let alive = true;
    void provider
      .request({ method: "eth_accounts" })
      .then((accts) => {
        if (alive && Array.isArray(accts) && accts[0]) setAddress(String(accts[0]));
      })
      .catch(() => undefined);

    const onAccounts = (...args: never[]) => {
      const accts = args[0] as unknown as string[] | undefined;
      setAddress(accts && accts[0] ? String(accts[0]) : null);
    };
    provider.on?.("accountsChanged", onAccounts);
    return () => {
      alive = false;
      provider.removeListener?.("accountsChanged", onAccounts);
    };
  }, []);

  /** Prompts the wallet for read-only account access. */
  const connect = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) throw new Error("No browser wallet detected");
    const accts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    const next = accts?.[0] ? String(accts[0]) : null;
    setAddress(next);
    return next;
  }, []);

  return { address, available, connect };
}

/** Live, read-only balances for the connected account. */
export function useWalletBalances(address: string | null) {
  return useQuery({
    queryKey: ["wallet-balances", address],
    queryFn: () => readBalances(address as string),
    enabled: Boolean(address),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}
