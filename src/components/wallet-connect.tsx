import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
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
  Radar,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { useSecurity } from "@/lib/security-store";
import { WalletThreatDialog } from "@/components/wallet-threat-dialog";
import { scanWallet, shortAddress, type WalletScanResult } from "@/lib/wallet-scan";
import { Link } from "@tanstack/react-router";
import { notifyNewThreats } from "@/lib/threat-notify";
import { runScheduledReportIfDue } from "@/lib/report-schedule";
import {
  DEMO_WALLET_ADDRESS,
  getWalletMonitor,
  registerRescanHandler,
  setWalletSession,
  useWalletMonitor,
  recordScanRun,
  getWalletInterval,
} from "@/lib/wallet-session";


const WALLETS = ["MetaMask (mock)", "Phantom (mock)", "WalletConnect (mock)", "Coinbase (mock)"];

export function WalletConnect() {
  const security = useSecurity();
  const monitor = useWalletMonitor();

  const [connected, setConnected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<WalletScanResult | null>(null);

  const DEMO_ADDRESS = DEMO_WALLET_ADDRESS;

  const lastThreatIds = useRef<Set<string>>(new Set());
  const firstScan = useRef(true);

  const runScan = useCallback(
    async (walletName: string, opts?: { background?: boolean }) => {
      const background = !!opts?.background;
      if (!background) {
        setScan(null);
        setScanOpen(true);
      }
      setScanning(true);
      setWalletSession({ scanning: true, ...(background ? {} : { scan: null }) });
      const result = await scanWallet(DEMO_ADDRESS, { includeEmerging: background });
      setScan(result);
      setScanning(false);
      setWalletSession({ scanning: false, scan: result });
      recordScanRun(result, background ? "background" : firstScan.current ? "connect" : "manual");
      firstScan.current = false;

      const previous = lastThreatIds.current;
      const newThreats = result.threats.filter((t) => !previous.has(t.id));
      lastThreatIds.current = new Set(result.threats.map((t) => t.id));

      const toLog = background ? newThreats : result.threats;
      for (const t of toLog) {
        security.report({
          kind: t.rules.includes("phishing-address-list")
            ? "phishing-domain"
            : "suspicious-address",
          severity: t.risk === "critical" ? "critical" : "warn",
          source: "wallet-scan",
          message: `${background ? "New " : ""}${t.risk === "critical" ? "Phishing" : "Risky"} approval on ${walletName}: ${t.token} → ${shortAddress(t.spender)}`,
          detail: t.reasons.join(" "),
          matchedRule: t.rules[0],
          blocked: false,
        });
      }

      // Deliver push / email for newly detected risky approvals (both
      // background sweeps and the first scan after connecting).
      const settings = getWalletMonitor();
      if (newThreats.length > 0 && (settings.pushOnNewThreats || settings.emailOnNewThreats)) {
        void notifyNewThreats(
          DEMO_ADDRESS,
          newThreats,
          {
            push: settings.pushOnNewThreats,
            email: settings.emailOnNewThreats,
            pdfReport: settings.emailPdfReport,
          },
          result,
        ).then((res) => {
          if (res.email === false && res.emailReason && res.emailReason !== "duplicate") {
            const why =
              res.emailReason === "email_not_configured"
                ? "email alerts need a verified sender domain"
                : res.emailReason === "no_account_email"
                  ? "sign in to receive email alerts"
                  : res.emailReason;
            toast.warning(`Threat email not sent — ${why}`);
          }
        });
      }

      if (background) {
        if (newThreats.length > 0 && settings.notifyOnNewThreats) {
          toast.error(
            `${newThreats.length} new risky approval${newThreats.length > 1 ? "s" : ""} detected on your wallet`,
            {
              description:
                "Background monitor found a newly granted spender. Review and revoke it now.",
              duration: 15000,
              action: { label: "Review", onClick: () => setScanOpen(true) },
            },
          );
        }
        return;
      }

      if (result.threats.length === 0) {
        toast.success("Wallet scan clear — no phishing approvals found");
      } else {
        toast.error(
          `${result.threats.length} risky approval${result.threats.length > 1 ? "s" : ""} found on your wallet`,
          {
            description: "Phishing spenders can drain approved tokens. Revoke them now.",
            duration: 10000,
            action: { label: "Review", onClick: () => setScanOpen(true) },
          },
        );
      }
    },
    [security],
  );

  const handleRevoked = useCallback((id: string) => {
    lastThreatIds.current.delete(id);
    setScan((prev) => {
      const next =
      prev
        ? {
            ...prev,
            approvals: prev.approvals.filter((a) => a.id !== id),
            threats: prev.threats.filter((a) => a.id !== id),
            totalValueAtRiskUsd: prev.threats
              .filter((a) => a.id !== id)
              .reduce((s, a) => s + a.valueAtRiskUsd, 0),
          }
        : prev;
      setWalletSession({ scan: next ?? null });
      return next;
    });
  }, []);

  // Let other screens (Security Center) trigger a rescan of this wallet.
  useEffect(() => {
    if (!connected) {
      registerRescanHandler(null);
      return;
    }
    registerRescanHandler((opts) => void runScan(connected, opts));
    return () => registerRescanHandler(null);
  }, [connected, runScan]);

  // Periodic background monitoring while a wallet is connected.
  // Interval respects a per-wallet override when one is set.
  const effectiveInterval = getWalletInterval(connected ? DEMO_ADDRESS : null);
  useEffect(() => {
    if (!connected || !monitor.enabled) return;
    const id = window.setInterval(
      () => {
        if (document.hidden) return;
        void runScan(connected, { background: true });
      },
      Math.max(1, effectiveInterval) * 60_000,
    );
    return () => window.clearInterval(id);
  }, [connected, monitor.enabled, effectiveInterval, runScan]);

  // Recurring PDF threat-report export (daily / weekly at a chosen local hour).
  // Checked once a minute plus immediately on mount so a slot missed while the
  // app was closed still fires on the next visit.
  const scheduleKey = JSON.stringify(monitor.reportSchedule);
  useEffect(() => {
    if (!connected || monitor.reportSchedule.frequency === "off") return;
    let cancelled = false;

    const tick = () => {
      void runScheduledReportIfDue()
        .then((res) => {
          if (!res || cancelled) return;
          const parts: string[] = [];
          if (res.downloaded) parts.push(`downloaded ${res.filename}`);
          if (res.emailed) parts.push("emailed to your account");
          toast.success("Scheduled wallet threat report ready", {
            description: `${res.threats} flagged approval${res.threats === 1 ? "" : "s"} · ${
              parts.join(" · ") || "generated"
            } · ID ${res.correlationId}`,
            duration: 12000,
          });
          if (!res.emailed && res.emailReason) {
            toast.warning(`Report email not sent — ${res.emailReason}`);
          }
        })
        .catch(() => {
          if (!cancelled) toast.error("Scheduled threat report failed to generate");
        });
    };

    tick();
    const id = window.setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // scheduleKey captures frequency/hour/weekday/delivery/lastRunAt changes.
  }, [connected, scheduleKey, monitor.reportSchedule.frequency]);


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
    setWalletSession({ wallet: name, address: DEMO_ADDRESS, scan: null });
    setOpen(false);
    toast.success(`${name} — read-only demo connected`);
    void runScan(name);
  };

  if (connected) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => {
            setConnected(null);
            setScan(null);
            setWalletSession({ wallet: null, address: null, scanning: false, scan: null });
          }}
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
        {(scanning || scan) && (
          <button
            onClick={() => setScanOpen(true)}
            className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition ${
              scan && scan.threats.length > 0
                ? "border-rose-500/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10"
            }`}
          >
            <span className="flex items-center gap-1.5 font-semibold">
              {scanning ? (
                <>
                  <Radar className="h-3.5 w-3.5 animate-pulse" /> Scanning wallet…
                </>
              ) : scan && scan.threats.length > 0 ? (
                <>
                  <ShieldOff className="h-3.5 w-3.5" /> {scan.threats.length} risky approval
                  {scan.threats.length > 1 ? "s" : ""} — revoke
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" /> Wallet scan clear
                </>
              )}
            </span>
          </button>
        )}
        <ReportDialog open={reportOpen} onOpenChange={setReportOpen} />
        <WalletThreatDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          scanning={scanning}
          result={scan}
          onRevoked={handleRevoked}
        />
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
