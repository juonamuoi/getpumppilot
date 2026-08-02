/* ------------------------------------------------------------------ *
 * Ready-to-trade status — a preflight checklist shown above the swap
 * buttons so nothing is signed with half-valid inputs.
 * ------------------------------------------------------------------ */
import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReadinessCheck, ReadinessResult } from "@/lib/swap-readiness";

const ICONS = {
  ok: CheckCircle2,
  blocked: XCircle,
  pending: CircleDashed,
} as const;

const TONE = {
  ok: "text-primary",
  blocked: "text-destructive",
  pending: "text-muted-foreground",
} as const;

export function SwapReadinessPanel({
  result,
  busy,
  onFix,
}: {
  result: ReadinessResult;
  busy?: boolean;
  onFix?: (fix: NonNullable<ReadinessCheck["fix"]>) => void;
}) {
  const tone = result.ready
    ? "border-primary/50 bg-primary/10"
    : result.blockers.length > 0
      ? "border-destructive/40 bg-destructive/10"
      : "border-border bg-muted/30";

  return (
    <div className={`rounded-md border p-3 ${tone}`} aria-live="polite">
      <div className="mb-2 flex items-center gap-2">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : result.ready ? (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
        ) : (
          <CircleDashed className="h-4 w-4 text-muted-foreground" />
        )}
        <p
          className={`text-sm font-semibold ${
            result.ready ? "text-primary" : "text-foreground"
          }`}
        >
          {result.ready ? "Ready to trade" : "Not ready yet"}
        </p>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {result.checks.filter((c) => c.status === "ok").length}/{result.checks.length} checks
          passed
        </span>
      </div>

      <p className="mb-2 text-xs text-muted-foreground">{result.headline}</p>

      <ul className="space-y-1.5">
        {result.checks.map((c) => {
          const Icon = ICONS[c.status];
          return (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${TONE[c.status]}`} />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-foreground">{c.label}</span>
                <span className="block text-muted-foreground">{c.detail}</span>
              </span>
              {c.status === "blocked" && c.fix && onFix && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 px-2 text-[11px]"
                  onClick={() => onFix(c.fix!)}
                  disabled={busy}
                >
                  {c.fix === "connect"
                    ? "Connect"
                    : c.fix === "switch-chain"
                      ? "Switch"
                      : "Fix"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
