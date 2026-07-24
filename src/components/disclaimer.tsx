import { AlertTriangle } from "lucide-react";

export function DisclaimerBanner() {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3 text-xs leading-relaxed text-amber-100/90">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div>
          <span className="font-semibold text-amber-300">Not financial advice.</span>{" "}
          All data shown is <span className="font-semibold">mock / demo</span>. Momentum scores are
          probabilistic signals — not predictions of future returns. Crypto markets are highly
          volatile and you can <span className="font-semibold">lose all invested capital</span>.
          Live execution is disabled and locked in this build.
        </div>
      </div>
    </div>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
      Demo
    </span>
  );
}
