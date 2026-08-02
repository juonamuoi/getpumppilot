/* ------------------------------------------------------------------ *
 * PumpPilot Wallet — an optional, self-custodial in-app EVM wallet.
 *
 * Created in the browser, never on a server:
 *   - a 12-word recovery phrase is generated locally with viem
 *   - the phrase is encrypted with the user's password
 *     (PBKDF2-SHA256, 310k iterations -> AES-GCM 256) and stored only in
 *     this browser's localStorage
 *   - the decrypted key lives in memory for the unlocked session only
 *
 * PumpPilot never transmits, uploads or asks for an existing seed phrase.
 * Users who prefer MetaMask/Rabby/Coinbase can keep using those instead.
 * ------------------------------------------------------------------ */
import { useSyncExternalStore } from "react";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Chain,
} from "viem";
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";
import { getLiveTrading } from "@/lib/live-trading";

const KEY = "pp.pump-wallet.v1";
const PBKDF2_ITERATIONS = 310_000;

export type PumpWalletRecord = {
  version: 1;
  address: string;
  createdAt: string;
  /** True once the user confirmed they wrote the recovery phrase down. */
  backedUp: boolean;
  /** base64 */
  salt: string;
  /** base64 */
  iv: string;
  /** base64 AES-GCM ciphertext of the recovery phrase */
  cipher: string;
};

export type PumpWalletState = {
  record: PumpWalletRecord | null;
  /** Address of the unlocked in-memory account, if any. */
  unlockedAddress: string | null;
};

const CHAINS: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  10: optimism,
  137: polygon,
};

/* --------------------------- crypto helpers --------------------------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (!/[a-z]/i.test(password) || !/[0-9]/.test(password))
    return "Mix letters and numbers so the vault is hard to brute force.";
  return null;
}

/* ------------------------------- store ------------------------------- */

let state: PumpWalletState = { record: null, unlockedAddress: null };
let account: Account | null = null;
let hydrated = false;
const listeners = new Set<() => void>();
const SERVER_STATE: PumpWalletState = { record: null, unlockedAddress: null };

function emit() {
  state = { ...state };
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PumpWalletRecord;
      if (parsed && parsed.address && parsed.cipher) state = { ...state, record: parsed };
    }
  } catch {
    // Corrupt entry — treat as "no wallet" rather than crashing the app.
  }
}

function persist(record: PumpWalletRecord | null) {
  if (typeof window === "undefined") return;
  try {
    if (record) window.localStorage.setItem(KEY, JSON.stringify(record));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage denied — the wallet only lives for this session.
  }
}

export function getPumpWallet(): PumpWalletState {
  hydrate();
  return state;
}

function subscribe(cb: () => void) {
  hydrate();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePumpWallet(): PumpWalletState {
  return useSyncExternalStore(subscribe, getPumpWallet, () => SERVER_STATE);
}

/* ------------------------------ lifecycle ---------------------------- */

/** Generates a brand-new wallet. Returns the recovery phrase to show once. */
export async function createPumpWallet(password: string): Promise<{ address: string; mnemonic: string }> {
  hydrate();
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);

  const mnemonic = generateMnemonic(english);
  const acct = mnemonicToAccount(mnemonic);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    enc.encode(mnemonic),
  );

  const record: PumpWalletRecord = {
    version: 1,
    address: acct.address,
    createdAt: new Date().toISOString(),
    backedUp: false,
    salt: toB64(salt),
    iv: toB64(iv),
    cipher: toB64(cipher),
  };
  persist(record);
  account = acct;
  state = { record, unlockedAddress: acct.address };
  emit();
  return { address: acct.address, mnemonic };
}

async function decryptMnemonic(record: PumpWalletRecord, password: string) {
  const key = await deriveKey(password, fromB64(record.salt));
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(record.iv) as unknown as BufferSource },
      key,
      fromB64(record.cipher) as unknown as BufferSource,
    );
    return dec.decode(plain);
  } catch {
    throw new Error("Wrong password.");
  }
}

/** Decrypts the wallet into memory for this session. */
export async function unlockPumpWallet(password: string): Promise<string> {
  hydrate();
  const record = state.record;
  if (!record) throw new Error("No PumpPilot wallet on this device.");
  const mnemonic = await decryptMnemonic(record, password);
  account = mnemonicToAccount(mnemonic);
  state = { ...state, unlockedAddress: account.address };
  emit();
  return account.address;
}

/** Drops the in-memory key. The encrypted vault stays on the device. */
export function lockPumpWallet() {
  account = null;
  state = { ...state, unlockedAddress: null };
  emit();
}

/** Reveals the recovery phrase — always password-gated. */
export async function revealRecoveryPhrase(password: string): Promise<string> {
  hydrate();
  const record = state.record;
  if (!record) throw new Error("No PumpPilot wallet on this device.");
  return decryptMnemonic(record, password);
}

export function markBackedUp() {
  hydrate();
  if (!state.record) return;
  const record = { ...state.record, backedUp: true };
  persist(record);
  state = { ...state, record };
  emit();
}

/* --------------------- password change / reset ----------------------- */

/** Re-encrypts an existing phrase under a fresh salt/IV and new password. */
async function reencrypt(
  record: PumpWalletRecord,
  mnemonic: string,
  newPassword: string,
): Promise<PumpWalletRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(newPassword, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    enc.encode(mnemonic),
  );
  return {
    ...record,
    salt: toB64(salt),
    iv: toB64(iv),
    cipher: toB64(cipher),
    rotatedAt: new Date().toISOString(),
  };
}

/**
 * Changes the vault password. Decrypts with the current password in memory,
 * re-encrypts under a brand-new salt/IV, and writes the vault back. The
 * phrase itself is never persisted in plaintext and never leaves the device.
 */
export async function changePumpWalletPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  hydrate();
  const record = state.record;
  if (!record) throw new Error("No PumpPilot wallet on this device.");
  const problem = passwordProblem(newPassword);
  if (problem) throw new Error(problem);
  if (newPassword === currentPassword)
    throw new Error("Choose a password different from the current one.");

  const mnemonic = await decryptMnemonic(record, currentPassword);
  const next = await reencrypt(record, mnemonic, newPassword);
  persist(next);
  state = { ...state, record: next };
  emit();
}

/**
 * Password reset — only possible with the 12-word recovery phrase, since the
 * password is never stored or recoverable. The phrase is used in memory to
 * verify it matches this vault's address, then discarded: we persist only the
 * newly encrypted vault.
 */
export async function resetPumpWalletPassword(
  recoveryPhrase: string,
  newPassword: string,
): Promise<void> {
  hydrate();
  const record = state.record;
  if (!record) throw new Error("No PumpPilot wallet on this device.");
  const problem = passwordProblem(newPassword);
  if (problem) throw new Error(problem);

  const phrase = recoveryPhrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (phrase.split(" ").length !== 12)
    throw new Error("Enter all 12 recovery words, separated by spaces.");

  let acct: Account;
  try {
    acct = mnemonicToAccount(phrase);
  } catch {
    throw new Error("That recovery phrase is not valid.");
  }
  if (acct.address.toLowerCase() !== record.address.toLowerCase())
    throw new Error("That phrase belongs to a different wallet.");

  const next = await reencrypt(record, phrase, newPassword);
  persist(next);
  account = acct;
  state = { record: next, unlockedAddress: acct.address };
  emit();
}


/** Permanently removes the encrypted vault from this browser. */
export function deletePumpWallet() {
  persist(null);
  account = null;
  state = { record: null, unlockedAddress: null };
  emit();
}

export function isPumpWalletUnlocked() {
  return account !== null;
}

/* --------------------------- EIP-1193 shim --------------------------- */

let shimChainId = 1;

export function setPumpWalletChain(chainId: number) {
  if (CHAINS[chainId]) shimChainId = chainId;
}

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: never[]) => void) => void;
  removeListener?: (event: string, cb: (...args: never[]) => void) => void;
};

/**
 * Presents the in-app wallet through the same EIP-1193 surface the rest of
 * the app already uses for MetaMask & friends, so balances, scans and swaps
 * work unchanged. Reads go to a public RPC; writes are signed locally.
 */
export function getPumpWalletProvider(): Eip1193 | null {
  if (!account) return null;
  setPumpWalletChain(getLiveTrading().chainId);
  const acct = account;

  return {
    async request({ method, params }) {
      // Follow the app's selected trading chain unless it was switched here.
      const chain = CHAINS[shimChainId] ?? mainnet;
      const publicClient = createPublicClient({ chain, transport: http() });

      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [acct.address];
        case "eth_chainId":
          return `0x${chain.id.toString(16)}`;
        case "wallet_switchEthereumChain": {
          const target = Number((params?.[0] as { chainId?: string })?.chainId ?? "0x1");
          if (!CHAINS[target]) throw new Error("Chain not supported by the PumpPilot wallet");
          setPumpWalletChain(target);
          return null;
        }
        case "personal_sign": {
          const message = String(params?.[0] ?? "");
          return acct.signMessage?.({ message: { raw: message as `0x${string}` } });
        }
        case "eth_sendTransaction": {
          const tx = (params?.[0] ?? {}) as {
            to?: string;
            data?: string;
            value?: string;
            gas?: string;
          };
          const walletClient = createWalletClient({ account: acct, chain, transport: http() });
          return walletClient.sendTransaction({
            account: acct,
            chain,
            to: tx.to as `0x${string}`,
            data: tx.data as `0x${string}` | undefined,
            ...(tx.value ? { value: BigInt(tx.value) } : {}),
            ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
          });
        }
        default:
          // Everything else (eth_call, eth_getBalance, eth_getLogs…) is a read.
          return publicClient.request({ method, params } as never);
      }
    },
    on: () => undefined,
    removeListener: () => undefined,
  };
}
