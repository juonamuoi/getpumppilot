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

  for (const t of TOKENS_BY_CHAIN[chainId] ?? []) {
    try {
      const data = `0x70a08231${address.toLowerCase().replace("0x", "").padStart(64, "0")}`;
      const raw = hexToNumber(
        await provider.request({
          method: "eth_call",
          params: [{ to: t.address, data }, "latest"],
        }),
      );
      const amount = toAmount(raw, t.decimals);
      if (amount > 0) {
        balances.push({
          symbol: t.symbol,
          name: t.name,
          amount,
          usdPeg: t.usdPeg,
          kind: "erc20",
        });
      }
    } catch {
      // A token read failing must never break the whole portfolio.
    }
  }

  return {
    address,
    chainId,
    chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
    balances,
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
