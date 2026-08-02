import { AlertTriangle, Info, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FriendlySwapError } from "@/lib/swap-errors";

interface Props {
  error: FriendlySwapError;
  busy?: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

/** Inline, plain-English failure panel with suggested fixes + one-click retry. */
export function SwapErrorPanel({ error, busy, onRetry, onDismiss }: Props) {
  const soft = error.userRejected;
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`space-y-2 rounded-md border p-3 text-xs ${
        soft ? "border-border bg-muted/40" : "border-destructive/50 bg-destructive/10"
      }`}
    >
      <div className="flex items-start gap-2">
        {soft ? (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${soft ? "text-foreground" : "text-destructive"}`}>
            {error.title}
          </p>
          <p className="mt-0.5 text-muted-foreground">{error.detail}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {error.fixes.length > 0 && (
        <div className="pl-6">
          <p className="mb-0.5 font-medium text-foreground">Try this:</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
            {error.fixes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="pl-6">
        <Button size="sm" variant={soft ? "outline" : "destructive"} onClick={onRetry} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          {error.retryLabel}
        </Button>
      </div>
    </div>
  );
}
