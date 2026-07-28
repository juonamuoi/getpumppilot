/* ------------------------------------------------------------------ *
 * In-app PDF preview for the wallet threat report.
 *
 * Renders the generated PDF into a blob URL and shows it in an iframe
 * so timestamps, correlation IDs and findings can be confirmed before
 * the file is downloaded.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useState } from "react";
import { Download, FileDown, Loader2, RefreshCw } from "lucide-react";
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
import { buildWalletReportDoc } from "@/lib/wallet-report-pdf";
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
