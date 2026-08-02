import { Check, CircleDashed, Loader2, X } from "lucide-react";

export type SwapStepId = "quote" | "approve" | "submit" | "confirm";
export type SwapStepStatus = "idle" | "active" | "done" | "error" | "skipped";

export interface SwapStepState {
  status: SwapStepStatus;
  note?: string;
}

export type SwapProgress = Record<SwapStepId, SwapStepState>;

export const IDLE_PROGRESS: SwapProgress = {
  quote: { status: "idle" },
  approve: { status: "idle" },
  submit: { status: "idle" },
  confirm: { status: "idle" },
};

const LABELS: Record<SwapStepId, string> = {
  quote: "Route & quote",
  approve: "Token approval",
  submit: "Sign & submit swap",
  confirm: "On-chain confirmation",
};

const ORDER: SwapStepId[] = ["quote", "approve", "submit", "confirm"];

function Icon({ status }: { status: SwapStepStatus }) {
  if (status === "active") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "done") return <Check className="h-4 w-4 text-primary" />;
  if (status === "error") return <X className="h-4 w-4 text-destructive" />;
  return <CircleDashed className="h-4 w-4 text-muted-foreground/60" />;
}

/** Vertical stepper showing exactly where a live swap currently is. */
export function SwapProgressSteps({ progress }: { progress: SwapProgress }) {
  const started = ORDER.some((id) => progress[id].status !== "idle");
  if (!started) return null;

  return (
    <ol
      aria-label="Transaction progress"
      aria-live="polite"
      className="space-y-0 rounded-md border border-border bg-muted/30 p-3 text-xs"
    >
      {ORDER.map((id, i) => {
        const { status, note } = progress[id];
        const last = i === ORDER.length - 1;
        return (
          <li key={id} className="flex gap-2">
            <div className="flex flex-col items-center">
              <Icon status={status} />
              {!last && (
                <span
                  className={`my-0.5 w-px flex-1 ${
                    progress[id].status === "done" ? "bg-primary/50" : "bg-border"
                  }`}
                />
              )}
            </div>
            <div className={`min-w-0 flex-1 ${last ? "" : "pb-3"}`}>
              <p
                className={
                  status === "idle"
                    ? "text-muted-foreground/70"
                    : status === "error"
                      ? "font-medium text-destructive"
                      : status === "skipped"
                        ? "text-muted-foreground line-through"
                        : "font-medium text-foreground"
                }
              >
                {LABELS[id]}
                {status === "skipped" && " — not needed"}
              </p>
              {note && <p className="mt-0.5 break-words text-muted-foreground">{note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
