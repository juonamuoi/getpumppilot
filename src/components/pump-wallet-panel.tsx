/* ------------------------------------------------------------------ *
 * PumpPilot Wallet panel — optional in-app self-custodial wallet.
 *
 * Flow: create (password) -> show recovery phrase once -> confirm backup.
 * Later visits: unlock with the password, or lock / reveal phrase / remove.
 * Everything happens in this browser. Nothing is uploaded.
 * ------------------------------------------------------------------ */
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  createPumpWallet,
  deletePumpWallet,
  lockPumpWallet,
  markBackedUp,
  passwordProblem,
  revealRecoveryPhrase,
  unlockPumpWallet,
  usePumpWallet,
} from "@/lib/pump-wallet";
import {
  useRecoveryChecklist,
  WalletRecoveryChecklist,
} from "@/components/wallet-recovery-checklist";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function PhraseGrid({ mnemonic }: { mnemonic: string }) {
  const words = mnemonic.split(" ");
  return (
    <div className="grid grid-cols-3 gap-2">
      {words.map((w, i) => (
        <div
          key={`${w}-${i}`}
          className="rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-xs"
        >
          <span className="mr-1 text-muted-foreground">{i + 1}.</span>
          {w}
        </div>
      ))}
    </div>
  );
}

export function PumpWalletPanel() {
  const { record, unlockedAddress } = usePumpWallet();
  const [mode, setMode] = useState<"idle" | "create">("idle");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealPassword, setRevealPassword] = useState("");
  const [showReveal, setShowReveal] = useState(false);
  const checklist = useRecoveryChecklist();



  const reset = () => {
    setPassword("");
    setConfirm("");
    setRevealPassword("");
  };

  async function handleCreate() {
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const { mnemonic } = await createPumpWallet(password);
      setPhrase(mnemonic);
      setMode("idle");
      reset();
      toast.success("PumpPilot wallet created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create wallet");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setBusy(true);
    try {
      await unlockPumpWallet(password);
      reset();
      toast.success("Wallet unlocked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unlock");
    } finally {
      setBusy(false);
    }
  }

  async function handleReveal() {
    setBusy(true);
    try {
      const m = await revealRecoveryPhrase(revealPassword);
      setPhrase(m);
      setShowReveal(false);
      setRevealPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wrong password");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------- recovery phrase view ------------------------ */
  if (phrase) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
          <AlertTriangle className="h-4 w-4" /> Shown once — write these 12 words down now
        </div>
        <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
          <p className="font-medium">Read this before you continue:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>
              This phrase is displayed <strong>one time</strong>. Once you dismiss it, it can only be
              re-shown by re-entering your wallet password on this device.
            </li>
            <li>
              Store it <strong>offline</strong> — paper or metal. Never a screenshot, photo, notes
              app, password manager sync, email or cloud drive.
            </li>
            <li>
              Anyone with these 12 words can drain this wallet instantly, with no password and no way
              to reverse it.
            </li>
            <li>Lose the phrase and lose this device, and the funds are gone permanently.</li>
            <li>PumpPilot support will never ask for it. Every such request is a scam.</li>
          </ul>
        </div>
        <PhraseGrid mnemonic={phrase} />

        <WalletRecoveryChecklist
          checked={checklist.checked}
          onToggle={checklist.toggle}
          done={checklist.done}
          total={checklist.total}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(phrase);
              setCopied(true);
              toast.warning("Clipboard is not a safe backup — paste it nowhere online.");
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            Copy phrase
          </Button>
          <Button
            size="sm"
            disabled={!checklist.complete}
            title={
              checklist.complete
                ? undefined
                : "Tick every checklist item to confirm your backup is safe."
            }
            onClick={() => {
              markBackedUp();
              setPhrase(null);
              toast.success("Backup confirmed — the phrase will not be shown again.");
            }}
          >
            I've saved it securely
          </Button>
          {!checklist.complete ? (
            <span className="text-[11px] text-muted-foreground">
              {checklist.total - checklist.done} step
              {checklist.total - checklist.done === 1 ? "" : "s"} left before you can continue.
            </span>
          ) : null}
        </div>
      </div>
    );
  }


  /* ------------------------------ no wallet ----------------------------- */
  if (!record) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> Create a PumpPilot wallet
        </div>
        <p className="text-xs text-muted-foreground">
          No browser extension needed. We generate a wallet in this browser, encrypt it with your
          password and keep it on this device only. You stay in full custody.
        </p>

        {mode === "idle" ? (
          <Button size="sm" onClick={() => setMode("create")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Create wallet
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw-new" className="text-xs">
                Wallet password
              </Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters, letters + numbers"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm" className="text-xs">
                Confirm password
              </Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              We can't reset this password — it never leaves your device. After you generate the
              wallet, a 12-word recovery phrase is shown <strong>once</strong>: have pen and paper
              ready and store it offline, never as a screenshot or in the cloud.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void handleCreate()} disabled={busy}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Generate wallet
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMode("idle");
                  reset();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* --------------------------- existing wallet -------------------------- */
  const unlocked = Boolean(unlockedAddress);
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" /> PumpPilot wallet
        </div>
        <Badge variant={unlocked ? "default" : "secondary"} className="text-[10px]">
          {unlocked ? "Unlocked" : "Locked"}
        </Badge>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono">{shortAddr(record.address)}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={() => {
            void navigator.clipboard.writeText(record.address);
            toast.success("Address copied");
          }}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>

      {!record.backedUp ? (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px] text-amber-400">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Backup not confirmed ({checklist.done}/{checklist.total} checklist steps done). Reveal
              the phrase with your password, write it down offline, and finish the checklist before
              funding this wallet.
            </span>
          </p>
          <WalletRecoveryChecklist
            checked={checklist.checked}
            onToggle={checklist.toggle}
            done={checklist.done}
            total={checklist.total}
          />
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Backup confirmed. Your 12 words are never shown again automatically — reveal them with your
          password only when you are somewhere private, and keep the offline copy safe.
        </p>
      )}


      {!unlocked ? (
        <div className="space-y-2">
          <Label htmlFor="pw-unlock" className="text-xs">
            Password
          </Label>
          <Input
            id="pw-unlock"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleUnlock();
            }}
          />
          <Button size="sm" onClick={() => void handleUnlock()} disabled={busy || !password}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unlock className="mr-1.5 h-3.5 w-3.5" />
            )}
            Unlock wallet
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          This wallet is now the active account for balances, scans and live swaps.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {unlocked ? (
          <Button variant="outline" size="sm" onClick={() => lockPumpWallet()}>
            <Lock className="mr-1.5 h-3.5 w-3.5" /> Lock
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => setShowReveal((v) => !v)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> Recovery phrase
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            if (
              window.confirm(
                "Remove this wallet from the browser? You can only restore it with the 12-word recovery phrase.",
              )
            ) {
              deletePumpWallet();
              toast.success("Wallet removed from this device");
            }
          }}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
        </Button>
      </div>

      {showReveal ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label htmlFor="pw-reveal" className="text-xs">
            Confirm password to reveal the phrase
          </Label>
          <Input
            id="pw-reveal"
            type="password"
            autoComplete="current-password"
            value={revealPassword}
            onChange={(e) => setRevealPassword(e.target.value)}
          />
          <Button size="sm" onClick={() => void handleReveal()} disabled={busy || !revealPassword}>
            Reveal
          </Button>
        </div>
      ) : null}
    </div>
  );
}
