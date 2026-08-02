/* ------------------------------------------------------------------ *
 * Encrypted vault import/export.
 *
 * Moves a PumpPilot wallet between browsers WITHOUT ever handling a seed
 * phrase in plaintext: the exported file contains only the AES-GCM
 * ciphertext already stored on this device (plus its salt/IV). Whoever
 * imports it still needs the vault password to unlock anything.
 * ------------------------------------------------------------------ */
import {
  getPumpWallet,
  importPumpWalletRecord,
  verifyVaultPassword,
  type PumpWalletRecord,
} from "@/lib/pump-wallet";

export const VAULT_FILE_FORMAT = "pumppilot.vault";
export const VAULT_FILE_VERSION = 1;

export type VaultFile = {
  format: typeof VAULT_FILE_FORMAT;
  fileVersion: number;
  exportedAt: string;
  /** Present so the user can eyeball which wallet a file belongs to. */
  address: string;
  /** The encrypted record exactly as stored locally. No plaintext key material. */
  vault: PumpWalletRecord;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}${address.slice(-4)}`;
}

/** Builds the export payload for the vault currently on this device. */
export function buildVaultFile(): VaultFile {
  const { record } = getPumpWallet();
  if (!record) throw new Error("No PumpPilot wallet on this device to export.");
  return {
    format: VAULT_FILE_FORMAT,
    fileVersion: VAULT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    address: record.address,
    vault: record,
  };
}

/** Downloads the encrypted vault as a .json file. Password-gated. */
export async function exportVaultFile(password: string): Promise<string> {
  await verifyVaultPassword(password);
  const payload = buildVaultFile();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = payload.exportedAt.slice(0, 10);
  const name = `pumppilot-vault-${shortAddress(payload.address)}-${stamp}.json`;
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
  return name;
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Validates an untrusted file payload and returns the encrypted record. */
export function parseVaultFile(raw: string): VaultFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const f = data as Partial<VaultFile>;
  if (!f || f.format !== VAULT_FILE_FORMAT)
    throw new Error("That file is not a PumpPilot vault export.");
  if (typeof f.fileVersion !== "number" || f.fileVersion > VAULT_FILE_VERSION)
    throw new Error("This vault file was made by a newer version of PumpPilot.");

  const v = f.vault as Partial<PumpWalletRecord> | undefined;
  if (!v || typeof v !== "object") throw new Error("The vault file is missing its encrypted data.");
  if (typeof v.address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(v.address))
    throw new Error("The vault file has no valid wallet address.");
  for (const field of ["salt", "iv", "cipher"] as const) {
    const value = v[field];
    if (typeof value !== "string" || value.length === 0 || !B64.test(value))
      throw new Error(`The vault file's ${field} is missing or corrupt.`);
  }
  if (/\b(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\b/i.test(raw))
    throw new Error("That file looks like it contains a seed phrase. PumpPilot never imports plaintext phrases.");

  return {
    format: VAULT_FILE_FORMAT,
    fileVersion: f.fileVersion,
    exportedAt: typeof f.exportedAt === "string" ? f.exportedAt : new Date().toISOString(),
    address: v.address,
    vault: {
      version: 1,
      address: v.address,
      createdAt: typeof v.createdAt === "string" ? v.createdAt : new Date().toISOString(),
      backedUp: v.backedUp === true,
      salt: v.salt as string,
      iv: v.iv as string,
      cipher: v.cipher as string,
      ...(typeof v.rotatedAt === "string" ? { rotatedAt: v.rotatedAt } : {}),
    },
  };
}

/**
 * Imports a vault file. The password is verified against the file's own
 * ciphertext before anything is written, so a wrong password or a corrupt
 * file can never clobber the wallet already on this device.
 */
export async function importVaultFile(raw: string, password: string): Promise<string> {
  const parsed = parseVaultFile(raw);
  return importPumpWalletRecord(parsed.vault, password);
}
