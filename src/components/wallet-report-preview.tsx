/* ------------------------------------------------------------------ *
 * In-app PDF preview for the wallet threat report.
 *
 * Renders the generated PDF into a blob URL and shows it in an iframe
 * so timestamps, correlation IDs and findings can be confirmed before
 * the file is downloaded.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, FileDown, Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildWalletReportDoc } from "@/lib/wallet-report-pdf";
import { createThreatReportShareLink } from "@/lib/threat-share.functions";
import type { WalletScanResult } from "@/lib/wallet-scan";

export function WalletReportPreviewDialog({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: WalletScanResult | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [pages, setPages] = useState(0);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [base64, setBase64] = useState<string | null>(null);
  const [ttl, setTtl] = useState("24h");
  const [sharing, setSharing] = useState(false);
  const [share, setShare] = useState<{ url: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !result) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    setBuilding(true);
    setError(null);
    void (async () => {
      try {
        const { doc, filename: name } = await buildWalletReportDoc(result);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(doc.output("blob") as Blob);
        setBase64(doc.output("datauristring"));
        setShare(null);
        setPages(doc.getNumberOfPages());
        setFilename(name);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setError("Could not render the PDF preview.");
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [open, result, nonce]);

  const makeShareLink = useCallback(async () => {
    if (!base64 || !result) return;
    setSharing(true);
    try {
      const res = await createThreatReportShareLink({
        data: { pdfBase64: base64, correlationId: result.correlationId, ttl },
      });
      if (!res.ok || !res.url) {
        toast.error("Could not create the share link", {
          description:
            res.reason === "no_account_email" || res.reason === "share_failed"
              ? "Sign in to generate a signed link for your report."
              : res.reason,
        });
        return;
      }
      setShare({ url: res.url, expiresAt: res.expiresAt ?? Date.now() });
      toast.success("Signed share link created", {
        description: `Expires ${new Date(res.expiresAt ?? Date.now()).toLocaleString()} · correlation ID ${result.correlationId}`,
      });
    } catch {
      toast.error("Could not create the share link", {
        description: "You need to be signed in to store and share the report.",
      });
    } finally {
      setSharing(false);
    }
  }, [base64, result, ttl]);

  const download = useCallback(() => {
    if (!url || !result) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    toast.success("Threat report exported", {
      description: `${filename} · correlation ID ${result.correlationId}`,
    });
    onOpenChange(false);
  }, [url, filename, result, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-4 w-4" /> Preview threat report
          </DialogTitle>
          <DialogDescription>
            Check the timestamps, correlation IDs and findings below before downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="h-[60vh] overflow-hidden rounded-lg border border-border/60 bg-muted/20">
          {building ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Building preview…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-300">
              {error}
            </div>
          ) : url ? (
            <iframe
              key={url}
              src={`${url}#toolbar=0&view=FitH`}
              title="Wallet threat report preview"
              className="h-full w-full"
            />
          ) : null}
        </div>

        {result && (
          <p className="font-mono text-[10px] text-muted-foreground">
            Scan ID {result.correlationId} · {new Date(result.scannedAt).toLocaleString()} (UTC{" "}
            {new Date(result.scannedAt).toISOString()})
            {pages > 0 && ` · ${pages} page${pages > 1 ? "s" : ""}`}
          </p>
        )}

        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-xs">Share link expiry</Label>
              <Select value={ttl} onValueChange={setTtl}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="24h">24 hours</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="gap-2"
              disabled={!base64 || building || sharing}
              onClick={() => void makeShareLink()}
            >
              {sharing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Create signed link
            </Button>
          </div>

          {share ? (
            <div className="mt-3 space-y-1">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={share.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-8 flex-1 rounded-md border border-border/60 bg-background px-2 font-mono text-[11px]"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  onClick={() => {
                    void navigator.clipboard.writeText(share.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                    toast.success("Share link copied");
                  }}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy
                </Button>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                Expires {new Date(share.expiresAt).toLocaleString()} · correlation ID{" "}
                {result?.correlationId}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Creates a private, time-limited signed download link. It expires automatically and is
              never public.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            disabled={building}
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshCw className="h-4 w-4" /> Rebuild preview
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="gap-2" disabled={!url || building} onClick={download}>
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
