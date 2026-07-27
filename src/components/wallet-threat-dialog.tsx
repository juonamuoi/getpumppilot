import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Radar,
  CheckCircle2,
  FileDown,
} from "lucide-react";
import { exportWalletReportPdf } from "@/lib/wallet-report-pdf";
import {
  revokeApproval,
  shortAddress,
  type ApprovalRisk,
  type WalletApproval,
  type WalletScanResult,
} from "@/lib/wallet-scan";

const RISK_STYLE: Record<ApprovalRisk, string> = {
  critical: "border-rose-500/50 bg-rose-500/10 text-rose-200",
  high: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  medium: "border-sky-500/50 bg-sky-500/10 text-sky-200",
  safe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function WalletThreatDialog({
  open,
  onOpenChange,
  scanning,
  result,
  onRevoked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scanning: boolean;
  result: WalletScanResult | null;
  onRevoked: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportPdf = useCallback(async () => {
    if (!result) return;
    setExporting(true);
    try {
      const file = await exportWalletReportPdf(result);
      toast.success("Threat report exported", {
        description: `${file} · correlation ID ${result.correlationId}`,
      });
    } catch {
      toast.error("Could not generate the PDF report");
    } finally {
      setExporting(false);
    }
  }, [result]);

  const revoke = useCallback(
    async (a: WalletApproval) => {
      setBusy(a.id);
      await revokeApproval(a);
      setBusy(null);
      onRevoked(a.id);
      toast.success(`Approval revoked — ${a.token} → ${shortAddress(a.spender)}`, {
        description: "Simulated revoke. In a live wallet this sends an approve(spender, 0) tx.",
      });
    },
    [onRevoked],
  );

  const revokeAll = useCallback(async () => {
    if (!result) return;
    setRevokingAll(true);
    for (const a of result.threats) {
      await revokeApproval(a);
      onRevoked(a.id);
    }
    setRevokingAll(false);
    toast.success("All flagged approvals revoked (simulated)");
  }, [result, onRevoked]);

  const threats = result?.threats ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" />
            Wallet security scan
            <Badge variant="outline" className="border-amber-500/40 text-amber-300">
              Demo data
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Every connection is scanned immediately for phishing spenders and risky token
            approvals that could drain your wallet.
          </DialogDescription>
        </DialogHeader>

        {scanning && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Scanning approvals, spenders and signature history…
            </div>
            <Progress value={66} />
          </div>
        )}

        {!scanning && result && threats.length === 0 && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" /> No phishing approvals found
            </div>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              We checked {result.approvals.length} outstanding approvals against the phishing
              address list and drainer heuristics. Nothing needs revoking right now.
            </p>
          </div>
        )}

        {!scanning && result && threats.length > 0 && (
          <>
            <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-100">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                {threats.length} risky approval{threats.length > 1 ? "s" : ""} detected
              </div>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                Up to <span className="font-semibold">{usd(result.totalValueAtRiskUsd)}</span> is
                reachable by these addresses. Revoke anything you don't recognise — revoking never
                moves your funds.
              </p>
            </div>

            <div className="space-y-2">
              {threats.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-lg border p-3 text-xs ${RISK_STYLE[t.risk]}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold uppercase tracking-wide">{t.risk}</span>
                    <span className="font-semibold">{t.token}</span>
                    <span className="opacity-80">→ {t.spenderLabel}</span>
                    <span className="ml-auto font-semibold">{usd(t.valueAtRiskUsd)}</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] opacity-80">
                    {shortAddress(t.spender)} ·{" "}
                    {t.allowance === null ? "Unlimited allowance" : `Allowance ${t.allowance}`}
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed opacity-95">
                    {t.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] opacity-70">
                      {t.rules.join(" · ")}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === t.id || revokingAll}
                      onClick={() => void revoke(t)}
                    >
                      {busy === t.id ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldOff className="mr-2 h-3.5 w-3.5" />
                      )}
                      Revoke access
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="destructive"
              className="w-full"
              disabled={revokingAll}
              onClick={() => void revokeAll()}
            >
              {revokingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldOff className="mr-2 h-4 w-4" />
              )}
              Revoke all {threats.length} flagged approvals
            </Button>
          </>
        )}

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
          {!scanning && result && (
            <>
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={exporting}
                onClick={() => void exportPdf()}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Export threat report (PDF)
              </Button>
              <p className="font-mono text-[10px] text-muted-foreground">
                Scan ID {result.correlationId} · {new Date(result.scannedAt).toLocaleString()}
              </p>
            </>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Simulated scan on mock approval data for this demo build. Revoking is simulated and
            signs nothing. PumpPilot AI never asks for seed phrases or private keys.
          </p>
          <div className="flex items-center justify-between text-[11px]">
            <Link
              to="/security"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              View in Security Center →
            </Link>
            {!scanning && result && threats.length === 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Wallet clear
              </span>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
