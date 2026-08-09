// Approval control — see, cap, or revoke every contract grant the connected
// wallet has signed on other platforms. Reads are on-chain; the only write is
// a transaction the user signs in their own wallet.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ExternalLink,
  FlaskConical,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Wallet,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInjectedAccount } from "@/lib/wallet-balances";
import { shortAddress } from "@/lib/wallet-scan";
import { explorerTxUrl, useLiveTrading } from "@/lib/live-trading";
import {
  clearSimulation,
  clearSimulations,
  latestByApproval,
  projectApprovals,
  simulateOverwrite,
  useApprovalSimulations,
  type ProjectedApproval,
} from "@/lib/approval-simulation";
import {
  RISK_LABEL,
  buildOverwriteTx,
  exposureAmount,
  riskOf,
  riskReason,
  submitOverwrite,
  useApprovalScan,
  type ApprovalChange,
  type ApprovalRisk,
  type TokenApproval,
} from "@/lib/token-approvals";


const RISK_STYLE: Record<ApprovalRisk, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  medium: "border-primary/40 bg-primary/10 text-primary",
  low: "border-border bg-muted/40 text-muted-foreground",
};

type RiskFilter = "all" | ApprovalRisk;

function fmtAmount(value: number): string {
  if (value === 0) return "0";
  if (value < 0.0001) return "<0.0001";
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function TokenApprovalsPanel() {
  const { address, available, connect } = useInjectedAccount();
  const scan = useApprovalScan(address);
  const live = useLiveTrading();
  const simulations = useApprovalSimulations();
  const [filter, setFilter] = useState<RiskFilter>("all");
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ approval: TokenApproval; change: ApprovalChange } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Live adapter switch is off → every write stays a simulation. */
  const paper = live.mode !== "live";
  const chainId = scan.data?.chainId;

  const sims = useMemo(
    () => latestByApproval(simulations, address, chainId),
    [simulations, address, chainId],
  );
  const rawApprovals = scan.data?.approvals ?? [];
  const approvals: ProjectedApproval[] = useMemo(
    () => (paper ? projectApprovals(rawApprovals, sims) : rawApprovals),
    [paper, rawApprovals, sims],
  );
  const visible = useMemo(
    () => (filter === "all" ? approvals : approvals.filter((a) => riskOf(a) === filter)),
    [approvals, filter],
  );
  const criticalCount = approvals.filter((a) => riskOf(a) === "critical").length;
  const unlimitedCount = approvals.filter((a) => a.unlimited).length;
  const simCount = paper ? sims.size : 0;

  const preview = pending ? buildOverwriteTx(pending.approval, pending.change, address ?? "0x") : null;

  async function apply(approval: TokenApproval, change: ApprovalChange) {
    if (!address) return;
    setBusyId(approval.id);
    try {
      if (paper) {
        // Nothing is signed and nothing is broadcast: we build the exact
        // calldata, then record the outcome locally.
        const entry = simulateOverwrite(approval, change, address, chainId ?? 0);
        toast.success(
          change.type === "revoke" ? "Revoke simulated" : "Spending cap simulated",
          {
            description: `Paper mode — no transaction sent. ${approval.symbol} · ${shortAddress(approval.spender)} · sim ${entry.simHash.slice(0, 10)}…`,
          },
        );
        return;
      }
      const hash = await submitOverwrite(approval, change, address);
      const url = scan.data ? explorerTxUrl(scan.data.chainId, hash) : null;
      toast.success(
        change.type === "revoke" ? "Revoke submitted" : "New allowance submitted",
        {
          description: `${approval.symbol} · ${shortAddress(approval.spender)}`,
          action: url ? { label: "View", onClick: () => window.open(url, "_blank") } : undefined,
        },
      );
      setTimeout(() => void scan.refetch(), 6_000);
    } catch (error) {
      toast.error(paper ? "Simulation failed" : "Transaction not sent", {
        description: error instanceof Error ? error.message : "Your wallet rejected the request.",
      });
    } finally {
      setBusyId(null);
      setPending(null);
    }
  }


  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Approval control
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect your wallet to see every contract grant you have signed on other platforms —
            and overwrite any of them from here. PumpPilot never asks for a seed phrase.
          </p>
          <Button onClick={() => void connect().catch(() => toast.error("Wallet connection declined"))} disabled={!available}>
            <Wallet className="mr-2 h-4 w-4" />
            {available ? "Connect wallet" : "No wallet detected"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Approval control
            <Badge variant={paper ? "secondary" : "destructive"} className="gap-1">
              {paper && <FlaskConical className="h-3 w-3" />}
              {paper ? "Paper — simulated" : "Live — real transactions"}
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {shortAddress(address)} · {approvals.length} live grant{approvals.length === 1 ? "" : "s"} ·{" "}
            {unlimitedCount} unlimited
            {simCount > 0 && <> · {simCount} simulated change{simCount === 1 ? "" : "s"}</>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as RiskFilter)}>
            <SelectTrigger className="h-8 w-[130px]" aria-label="Filter approvals by risk">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risk</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void scan.refetch()} disabled={scan.isFetching}>
            {scan.isFetching ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Rescan
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {paper && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-primary">Paper mode.</span> Every revoke and
                spending-cap change here is simulated: the exact calldata is built and the result is
                projected below, but nothing is signed, broadcast, or charged a network fee. Turn on
                live execution in Execution mode to send these for real.
              </p>
              {simCount > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span>
                    {simCount} simulated change{simCount === 1 ? "" : "s"} applied to the view below.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => {
                      clearSimulations(address);
                      toast.success("Simulations cleared", {
                        description: "Showing the real on-chain approvals again.",
                      });
                    }}
                  >
                    <RotateCcw className="mr-1.5 h-3 w-3" />
                    Reset simulation
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}


        {criticalCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-destructive">{criticalCount} critical grant
              {criticalCount === 1 ? "" : "s"}</span>{" "}
              let another platform move your assets without asking you again. Revoking overwrites the
              old signature on-chain — it costs a network fee and takes effect immediately.
            </p>
          </div>
        )}

        {scan.isLoading && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning approval history…
          </p>
        )}

        {scan.isError && (
          <p className="py-6 text-sm text-destructive">
            Approval scan failed on this network. Try again, or switch networks in your wallet.
          </p>
        )}

        {scan.data?.scanFailed && (
          <p className="text-xs text-amber-300">
            This network's RPC refused a full log scan, so some older grants may be missing.
          </p>
        )}

        {!scan.isLoading && !scan.isError && visible.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">
            No live approvals found in the last {(scan.data?.scannedBlocks ?? 0).toLocaleString()} blocks.
          </p>
        )}

        <ul className="space-y-2">
          {visible.map((a) => {
            const risk = riskOf(a);
            const busy = busyId === a.id;
            return (
              <li key={a.id} className="rounded-lg border border-border bg-card/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.symbol}</span>
                      <Badge variant="outline" className={RISK_STYLE[risk]}>
                        {RISK_LABEL[risk]}
                      </Badge>
                      {a.kind === "operator" && (
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          Whole collection
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{a.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Granted to <span className="font-mono">{shortAddress(a.spender)}</span> ·{" "}
                      {a.kind === "operator"
                        ? "every item, now and future"
                        : a.unlimited
                          ? "unlimited allowance"
                          : `${fmtAmount(a.allowanceAmount)} ${a.symbol} allowance`}
                      {a.kind === "erc20" && (
                        <> · {fmtAmount(exposureAmount(a))} {a.symbol} reachable today</>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{riskReason(a)}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setPending({ approval: a, change: { type: "revoke" } })}
                    >
                      {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="mr-2 h-3.5 w-3.5" />}
                      Revoke
                    </Button>
                  </div>
                </div>

                {a.kind === "erc20" && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
                    <div className="min-w-[140px] flex-1">
                      <Label htmlFor={`limit-${a.id}`} className="text-[11px] text-muted-foreground">
                        Overwrite with a spending cap ({a.symbol})
                      </Label>
                      <Input
                        id={`limit-${a.id}`}
                        inputMode="decimal"
                        placeholder="e.g. 100"
                        className="mt-1 h-8"
                        value={limits[a.id] ?? ""}
                        onChange={(e) => setLimits((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !/^\d*\.?\d+$/.test(limits[a.id] ?? "")}
                      onClick={() =>
                        setPending({
                          approval: a,
                          change: { type: "limit", amount: limits[a.id] ?? "0" },
                        })
                      }
                    >
                      Set cap
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="pt-1 text-[11px] text-muted-foreground">
          Only your wallet can change these grants, so every action here is a transaction you sign
          yourself. PumpPilot cannot alter approvals on your behalf and never sees your keys.
        </p>
      </CardContent>

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.change.type === "revoke" ? "Revoke this grant?" : "Overwrite the allowance?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {pending?.change.type === "revoke"
                    ? `${shortAddress(pending?.approval.spender ?? "")} will no longer be able to move your ${pending?.approval.symbol}.`
                    : `${shortAddress(pending?.approval.spender ?? "")} will be capped at ${pending?.change.type === "limit" ? pending.change.amount : ""} ${pending?.approval.symbol}.`}
                </p>
                <p className="text-muted-foreground">
                  This replaces the old on-chain signature. Your wallet will ask you to confirm, and
                  you pay the network fee.
                </p>
                {preview && (
                  <div className="rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] break-all">
                    <div>to: {preview.to}</div>
                    <div className="mt-1">data: {preview.data.slice(0, 42)}…</div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pending && void apply(pending.approval, pending.change)}
            >
              Sign in wallet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** Small helper used by the route header. */
export function ApprovalsExplorerHint() {
  return (
    <a
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      href="https://ethereum.org/en/developers/docs/standards/tokens/erc-20/"
      target="_blank"
      rel="noreferrer"
    >
      How token approvals work <ExternalLink className="h-3 w-3" />
    </a>
  );
}
