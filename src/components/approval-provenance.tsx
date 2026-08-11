// Provenance: where every allowance / operator row on this page came from,
// and which numbers are live on-chain reads versus local paper projections.
import { useState } from "react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  FlaskConical,
  Info,
  Radio,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chainName } from "@/lib/live-trading";
import { explorerAddressUrl, type ApprovalScan } from "@/lib/token-approvals";
import type { ProjectedApproval } from "@/lib/approval-simulation";

function fmtTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function relative(ms: number): string {
  if (!ms) return "";
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
}

async function copy(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Copy failed", { description: value });
  }
}

/** Live vs simulated label used everywhere on the approvals page. */
export function DataOriginBadge({ simulated }: { simulated: boolean }) {
  return simulated ? (
    <Badge
      variant="outline"
      className="gap-1 border-primary/40 bg-primary/10 text-primary"
      title="Numbers shown are a local paper projection — nothing was sent on-chain."
    >
      <FlaskConical className="h-3 w-3" /> Simulated data
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      title="Read directly from the chain through your own wallet's RPC."
    >
      <Radio className="h-3 w-3" /> Live on-chain
    </Badge>
  );
}

function Field({
  label,
  value,
  mono,
  href,
  copyValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string | null;
  copyValue?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`flex items-center gap-1 text-xs ${mono ? "font-mono" : ""}`}>
        <span className="truncate">{value}</span>
        {copyValue && (
          <button
            type="button"
            aria-label={`Copy ${label}`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => void copy(label, copyValue)}
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open ${label} in block explorer`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </dd>
    </div>
  );
}

/** Scan-level provenance header: source, chain, block window, timestamp. */
export function ScanProvenancePanel({
  scan,
  paper,
  simCount,
}: {
  scan: ApprovalScan | undefined;
  paper: boolean;
  simCount: number;
}) {
  const [open, setOpen] = useState(false);
  if (!scan) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <Info className="h-3.5 w-3.5 text-primary" />
          Data provenance
          <DataOriginBadge simulated={paper && simCount > 0} />
          <span className="font-normal text-muted-foreground">
            {chainName(scan.chainId)} · scanned {relative(scan.scannedAt)}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Source" value="eth_getLogs + eth_call" />
            <Field label="RPC" value="Your connected wallet" />
            <Field label="Chain" value={`${chainName(scan.chainId)} (${scan.chainId})`} />
            <Field
              label="Wallet"
              value={scan.address}
              mono
              copyValue={scan.address}
              href={explorerAddressUrl(scan.chainId, scan.address)}
            />
            <Field
              label="Block window"
              value={`${scan.fromBlock.toLocaleString()} → ${scan.toBlock.toLocaleString()}`}
            />
            <Field label="Blocks scanned" value={scan.scannedBlocks.toLocaleString()} />
            <Field label="Scan completed" value={fmtTime(scan.scannedAt)} />
            <Field
              label="Coverage"
              value={scan.scanFailed ? "Partial (RPC limited)" : "Complete"}
            />
          </dl>

          <p className="text-[11px] text-muted-foreground">
            Every grant below was discovered from approval events emitted on-chain and re-verified
            with a live <span className="font-mono">allowance()</span> or{" "}
            <span className="font-mono">isApprovedForAll()</span> call — no third-party API and no
            invented rows. {paper
              ? `Paper mode is on, so any row marked "Simulated data" shows a local projection of a change that was never broadcast${simCount > 0 ? ` (${simCount} active).` : "."}`
              : "Live mode is on, so all values reflect current chain state."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Per-row provenance for a single allowance / operator grant. */
export function ApprovalProvenance({ approval }: { approval: ProjectedApproval }) {
  const [open, setOpen] = useState(false);
  const simulated = Boolean(approval.simulated);
  const explorer = explorerAddressUrl(approval.chainId, approval.contract);

  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        Where this came from
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <DataOriginBadge simulated={simulated} />
            <Badge variant="outline" className="border-border text-muted-foreground">
              {approval.kind === "operator" ? "NFT collection operator" : "ERC-20 allowance"}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field
              label={approval.kind === "operator" ? "Collection contract" : "Token contract"}
              value={approval.contract}
              mono
              copyValue={approval.contract}
              href={explorer}
            />
            <Field
              label={approval.kind === "operator" ? "Operator" : "Spender"}
              value={approval.spender}
              mono
              copyValue={approval.spender}
              href={explorerAddressUrl(approval.chainId, approval.spender)}
            />
            <Field
              label="Asset"
              value={`${approval.symbol} — ${approval.name}${approval.kind === "erc20" ? ` (${approval.decimals} dp)` : ""}`}
            />
            <Field label="Chain" value={`${chainName(approval.chainId)} (${approval.chainId})`} />
            <Field label="Grant block" value={approval.lastBlock.toLocaleString()} />
            <Field label="Scanned at" value={fmtTime(approval.scannedAt)} />
            {approval.txHash && (
              <Field label="Grant tx" value={approval.txHash} mono copyValue={approval.txHash} />
            )}
          </dl>

          {simulated ? (
            <p className="text-[11px] text-primary">
              Mock/paper values: this row's allowance was changed by a local simulation on{" "}
              {fmtTime(approval.simulated?.at ?? 0)} (sim {approval.simulated?.simHash.slice(0, 10)}…).
              The contract, spender, and chain above are real; the amount shown is not on-chain.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Live values: discovered via an approval event on{" "}
              {chainName(approval.chainId)} at block {approval.lastBlock.toLocaleString()} and
              confirmed by a direct contract read at scan time.
            </p>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() =>
              void copy(
                "Provenance",
                JSON.stringify(
                  {
                    id: approval.id,
                    kind: approval.kind,
                    contract: approval.contract,
                    spender: approval.spender,
                    symbol: approval.symbol,
                    name: approval.name,
                    chainId: approval.chainId,
                    chain: chainName(approval.chainId),
                    lastBlock: approval.lastBlock,
                    txHash: approval.txHash,
                    scannedAt: new Date(approval.scannedAt).toISOString(),
                    dataOrigin: simulated ? "paper-simulation" : "onchain-log-scan",
                  },
                  null,
                  2,
                ),
              )
            }
          >
            <Copy className="mr-1.5 h-3 w-3" />
            Copy provenance JSON
          </Button>
        </div>
      )}
    </div>
  );
}
