import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { useCredits } from "@/hooks/useCredits";
import { cn } from "@/lib/utils";

/** Compact credit balance chip with a recharge link. */
export function CreditBadge({ className }: { className?: string }) {
  const { user } = useAuth();
  const { balance, loading, empty, low } = useCredits();

  if (!user || loading) return null;

  return (
    <Link
      to="/pricing"
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
        empty
          ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
          : low
            ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
        className,
      )}
      title={empty ? "Out of credits — bot paused" : "Credit balance"}
    >
      <Zap className="h-3.5 w-3.5" />
      {balance.toLocaleString()}
      <span className="hidden sm:inline text-[10px] opacity-70">{empty ? "· recharge" : "credits"}</span>
    </Link>
  );
}

/** Sidebar card showing balance, burn state and a recharge CTA. */
export function CreditMeter() {
  const { user } = useAuth();
  const { balance, loading, empty, low } = useCredits();
  if (!user || loading) return null;

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        empty ? "border-red-500/30 bg-red-500/5" : low ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/20",
      )}
    >
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-emerald-400" /> Credits
        </span>
        <span className={empty ? "text-red-300" : low ? "text-amber-300" : "text-foreground"}>
          {balance.toLocaleString()}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {empty
          ? "Balance empty — predictions and bot execution are stopped."
          : low
            ? "Running low. Recharge to keep the bot predicting."
            : "Pay-as-you-go. No subscription."}
      </p>
      <Link
        to="/pricing"
        className="mt-2 block rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-1.5 text-center text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20"
      >
        Recharge
      </Link>
    </div>
  );
}
