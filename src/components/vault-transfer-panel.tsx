/* ------------------------------------------------------------------ *
 * Encrypted vault import / export panel.
 *
 * Exports the AES-GCM ciphertext already stored in this browser and
 * imports the same file elsewhere. The recovery phrase is never written
 * to the file, shown, or transmitted — the password is always required.
 * ------------------------------------------------------------------ */
import { useRef, useState } from "react";
import { Download, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePumpWallet } from "@/lib/pump-wallet";
import { exportVaultFile, importVaultFile, parseVaultFile } from "@/lib/vault-transfer";

export function VaultTransferPanel() {
  const { record } = usePumpWallet();
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"idle" | "export" | "import">("idle");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ raw: string; address: string; exportedAt: string } | null>(
    null,
  );

  function reset() {
    setMode("idle");
    setPassword("");
    setPending(null);
  }

  async function handleExport() {
    setBusy(true);
    try {
      const name = await exportVaultFile(password);
      toast.success("Encrypted vault exported", {
        description: `${name} — it holds only ciphertext. The same password unlocks it elsewhere.`,
      });
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    try {
      const raw = await file.text();
      const parsed = parseVaultFile(raw);
      setPending({ raw, address: parsed.address, exportedAt: parsed.exportedAt });
      setMode("import");
      setPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That vault file could not be read.");
    }
  }

  async function handleImport() {
    if (!pending) return;
    setBusy(true);
    try {
      const address = await importVaultFile(pending.raw, password);
      toast.success("Vault imported and unlocked", {
        description: `${address.slice(0, 6)}…${address.slice(-4)} is now the active wallet on this browser.`,
      });
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <Label className="text-xs">Move this vault to another browser</Label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The export file contains only the encrypted blob — never your 12 words. Anyone who opens it
        still needs your vault password, so store it like a password-protected backup.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!record}
          onClick={() => {
            setMode(mode === "export" ? "idle" : "export");
            setPassword("");
            setPending(null);
          }}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export encrypted vault
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> Import vault file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose an encrypted PumpPilot vault file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </div>

      {mode === "export" ? (
        <div className="space-y-2 rounded-md border border-border/70 bg-muted/30 p-2">
          <Label htmlFor="vault-export-pw" className="text-xs">
            Confirm your vault password to export
          </Label>
          <Input
            id="vault-export-pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password) void handleExport();
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !password} onClick={() => void handleExport()}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Download file
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "import" && pending ? (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
          <p className="text-[11px] text-amber-400">
            Importing {pending.address.slice(0, 6)}…{pending.address.slice(-4)} (exported{" "}
            {pending.exportedAt.slice(0, 10)}).
            {record ? " This replaces the vault currently stored in this browser." : ""}
          </p>
          <Label htmlFor="vault-import-pw" className="text-xs">
            Password for the imported vault
          </Label>
          <Input
            id="vault-import-pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password) void handleImport();
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !password} onClick={() => void handleImport()}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Unlock & import
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Nothing is written until the password decrypts the file, so a wrong password leaves your
            current wallet untouched.
          </p>
        </div>
      ) : null}
    </div>
  );
}
