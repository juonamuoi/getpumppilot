import { useState } from "react";
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
import { Wallet, ShieldAlert, CheckCircle2 } from "lucide-react";

const WALLETS = ["MetaMask (mock)", "Phantom (mock)", "WalletConnect (mock)", "Coinbase (mock)"];

export function WalletConnect() {
  const [connected, setConnected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (connected) {
    return (
      <button
        onClick={() => setConnected(null)}
        className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-left transition hover:bg-emerald-500/10"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Connected
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{connected}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">0xDEMO…a1b2</div>
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2">
          <Wallet className="h-4 w-4" /> Connect wallet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a wallet</DialogTitle>
          <DialogDescription>
            Read-only demo connection. PumpPilot AI never requests seed phrases or private keys.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4" /> Security notice
          </div>
          <p className="mt-1 leading-relaxed">
            We will <span className="font-semibold">never</span> ask for your seed phrase, private
            key, or password. Anyone who does is trying to steal from you.
          </p>
        </div>

        <div className="grid gap-2">
          {WALLETS.map((w) => (
            <Button
              key={w}
              variant="secondary"
              className="justify-start"
              onClick={() => {
                setConnected(w);
                setOpen(false);
              }}
            >
              <Wallet className="mr-2 h-4 w-4" /> {w}
            </Button>
          ))}
        </div>

        <DialogFooter>
          <p className="text-[11px] text-muted-foreground">
            All wallet interactions in this build are simulated for portfolio viewing only.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
