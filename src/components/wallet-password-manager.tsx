/* ------------------------------------------------------------------ *
 * Change / reset the PumpPilot wallet password.
 *
 * Both flows re-encrypt the local vault in the browser under a fresh
 * salt + IV. The recovery phrase is only ever held in memory — it is
 * never stored in plaintext, never uploaded, and never logged.
 * ------------------------------------------------------------------ */
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, LifeBuoy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  changePumpWalletPassword,
  passwordProblem,
  resetPumpWalletPassword,
} from "@/lib/pump-wallet";

type Tab = "change" | "reset";

export function WalletPasswordManager({ rotatedAt }: { rotatedAt?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("change");
  const [busy, setBusy] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phrase, setPhrase] = useState("");

  const problem = next ? passwordProblem(next) : null;
  const mismatch = Boolean(confirm) && next !== confirm;

  function clear() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setPhrase("");
  }

  async function submit() {
    if (mismatch) {
      toast.error("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      if (tab === "change") await changePumpWalletPassword(current, next);
      else await resetPumpWalletPassword(phrase, next);
      clear();
      setOpen(false);
      void trackWalletStep("wallet_password_rotated", { method: tab });
      toast.success(
        tab === "change" ? "Password changed — vault re-encrypted" : "Password reset — wallet unlocked",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the password");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy &&
    !problem &&
    !mismatch &&
    Boolean(next) &&
    Boolean(confirm) &&
    (tab === "change" ? Boolean(current) : phrase.trim().split(/\s+/).length === 12);

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Password
      </Button>

      {open ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={tab === "change" ? "default" : "ghost"}
              onClick={() => setTab("change")}
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Change
            </Button>
            <Button
              size="sm"
              variant={tab === "reset" ? "default" : "ghost"}
              onClick={() => setTab("reset")}
            >
              <LifeBuoy className="mr-1.5 h-3.5 w-3.5" /> Forgot password
            </Button>
          </div>

          {tab === "change" ? (
            <div className="space-y-1.5">
              <Label htmlFor="pw-current" className="text-xs">
                Current password
              </Label>
              <Input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="pw-phrase" className="text-xs">
                Your 12-word recovery phrase
              </Label>
              <Textarea
                id="pw-phrase"
                rows={3}
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-xs"
                placeholder="word1 word2 word3 …"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                The password is never stored, so it can't be recovered — only the phrase can unlock
                this vault. It stays in this browser and is discarded right after re-encryption.
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pw-new" className="text-xs">
                New password
              </Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm" className="text-xs">
                Confirm new password
              </Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) void submit();
                }}
              />
            </div>
          </div>

          {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
          {mismatch ? <p className="text-xs text-destructive">Passwords do not match.</p> : null}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void submit()} disabled={!canSubmit}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {tab === "change" ? "Change password" : "Reset password"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clear();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Re-encrypts the vault locally with a new salt and key. Your recovery phrase stays the
            same — keep your offline backup.
            {rotatedAt ? ` Last changed ${new Date(rotatedAt).toLocaleDateString()}.` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
