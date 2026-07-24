import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wallet,
  ShieldAlert,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { useSecurity } from "@/lib/security-store";
import { Link } from "@tanstack/react-router";

const WALLETS = ["MetaMask (mock)", "Phantom (mock)", "WalletConnect (mock)", "Coinbase (mock)"];

export function WalletConnect() {
  const security = useSecurity();
  const [connected, setConnected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Verify current origin whenever the dialog opens.
  const originCheck = useMemo(() => security.checkOriginSafe(), [security, open]);

  useEffect(() => {
    if (!open || originCheck.ok) return;
    toast.error("Phishing blocker: this origin looks unsafe", {
      description: originCheck.matches[0]?.detail,
    });
  }, [open, originCheck]);

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData?.getData("text") ?? "";
    if (!text) return;
    const res = security.scanText(text, "wallet-connect");
    if (!res.ok && res.severity === "critical") {
      e.preventDefault();
      toast.error("Blocked paste — potential credential leak", {
        description:
          "PumpPilot AI never asks for seed phrases or private keys. The paste was blocked and logged.",
      });
    }
  };

  const connect = (name: string) => {
    if (!originCheck.ok) {
      security.report({
        kind: "phishing-domain",
        severity: "critical",
        source: "wallet-connect",
        message: "Blocked wallet connect on flagged origin",
        detail: originCheck.matches[0]?.detail,
        blocked: true,
      });
      toast.error("Connection blocked — origin flagged as unsafe");
      return;
    }
    setConnected(name);
    setOpen(false);
    toast.success(`${name} — read-only demo connected`);
  };

  if (connected) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setConnected(null)}
          className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-left transition hover:bg-emerald-500/10"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected · Read-only
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{connected}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">0xDEMO…a1b2</div>
        </button>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 text-[11px]">
          <span className="flex items-center gap-1 text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Anti-phishing ON
          </span>
          <button
            onClick={() => setReportOpen(true)}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Report scam
          </button>
        </div>
        <ReportDialog open={reportOpen} onOpenChange={setReportOpen} />
      </div>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full justify-start gap-2">
            <Wallet className="h-4 w-4" /> Connect wallet
          </Button>
        </DialogTrigger>
        <DialogContent onPaste={handlePaste}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Connect a wallet
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> Anti-phishing
              </span>
            </DialogTitle>
            <DialogDescription>
              Read-only demo connection. PumpPilot AI never requests seed phrases or private keys.
            </DialogDescription>
          </DialogHeader>

          {!originCheck.ok && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" /> Origin flagged
              </div>
              <p className="mt-1 leading-relaxed">{originCheck.matches[0]?.detail}</p>
              <p className="mt-1 opacity-80">
                Connections are disabled on flagged origins. Close this tab and reopen the app from
                the official URL.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="h-4 w-4" /> Security notice
            </div>
            <p className="mt-1 leading-relaxed">
              We will <span className="font-semibold">never</span> ask for your seed phrase, private
              key, or password. Anyone who does is trying to steal from you. Pasting a recovery
              phrase or key here will be blocked and logged automatically.
            </p>
          </div>

          <div className="grid gap-2">
            {WALLETS.map((w) => (
              <Button
                key={w}
                variant="secondary"
                className="justify-start"
                disabled={!originCheck.ok}
                onClick={() => connect(w)}
              >
                <Wallet className="mr-2 h-4 w-4" /> {w}
              </Button>
            ))}
          </div>

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
            <p className="text-[11px] text-muted-foreground">
              All wallet interactions in this build are simulated for portfolio viewing only.
            </p>
            <div className="flex items-center justify-between text-[11px]">
              <button
                onClick={() => {
                  setOpen(false);
                  setReportOpen(true);
                }}
                className="inline-flex items-center gap-1 text-rose-300 hover:underline"
              >
                <Flag className="h-3 w-3" /> Report a scam or phishing attempt
              </button>
              <Link
                to="/security"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Security center →
              </Link>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} />
    </>
  );
}

function ReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const security = useSecurity();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");

  const submit = () => {
    const trimmed = url.trim();
    if (!trimmed && !note.trim()) {
      toast.error("Add a link or a description before submitting");
      return;
    }
    let blocked = false;
    if (trimmed) {
      blocked = security.addBlockedDomain(trimmed, note.trim() || "User-reported scam");
    }
    security.report({
      kind: trimmed ? "phishing-domain" : "other",
      severity: "warn",
      source: "user",
      message: trimmed
        ? `User reported ${trimmed}`
        : "User reported a scam attempt",
      detail: note.trim() || undefined,
      blocked,
    });
    toast.success(
      blocked
        ? "Reported and added to blocklist"
        : "Report saved to security center",
    );
    setUrl("");
    setNote("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-rose-300" /> Report a scam or phishing attempt
          </DialogTitle>
          <DialogDescription>
            Add a link, address, or short description. Reports are stored in your Security Center
            and any domain is added to the local phishing blocklist.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Suspicious URL or domain (optional)</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://wallet-verify.example"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">What happened?</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Asked for my seed phrase in Discord DM"
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Submit report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
