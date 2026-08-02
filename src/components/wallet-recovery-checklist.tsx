/* ------------------------------------------------------------------ *
 * Wallet recovery checklist — the backup steps a user must tick before
 * we let them dismiss the one-time recovery phrase.
 *
 * State is kept in this browser only (localStorage). No phrase, no
 * password, and no checklist data ever leaves the device.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useState } from "react";
import { Check, ShieldAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const STORE_KEY = "pumppilot.wallet.recovery-checklist.v1";

export interface RecoveryStep {
  id: string;
  label: string;
  detail: string;
}

export const RECOVERY_STEPS: RecoveryStep[] = [
  {
    id: "written",
    label: "I wrote all 12 words down on paper (or metal), in order",
    detail:
      "Order matters. A single swapped word makes the phrase useless for recovery.",
  },
  {
    id: "offline",
    label: "My backup is stored offline, not in a photo, notes app or cloud drive",
    detail:
      "Screenshots, phone galleries and cloud notes are the #1 way crypto wallets get drained.",
  },
  {
    id: "verified",
    label: "I checked my copy word-for-word against the phrase on screen",
    detail: "Read it back out loud once — typos are only discovered when it is too late.",
  },
  {
    id: "location",
    label: "My backup is somewhere safe from fire, water and other people",
    detail:
      "Anyone who reads these words can spend your funds without your password or this device.",
  },
  {
    id: "no-share",
    label: "I understand nobody — including PumpPilot support — may ever ask for it",
    detail: "Every request for your 12 words is a scam, with no exceptions.",
  },
];

function readState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Persisted checklist state plus a helper for "all steps complete". */
export function useRecoveryChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked(readState());
  }, []);

  const toggle = useCallback((id: string, value: boolean) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: value };
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — checklist stays in memory */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setChecked({});
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const done = RECOVERY_STEPS.filter((s) => checked[s.id]).length;
  return { checked, toggle, reset, done, total: RECOVERY_STEPS.length, complete: done === RECOVERY_STEPS.length };
}

export function WalletRecoveryChecklist({
  checked,
  onToggle,
  done,
  total,
}: {
  checked: Record<string, boolean>;
  onToggle: (id: string, value: boolean) => void;
  done: number;
  total: number;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
        <p className="text-xs font-semibold">Recovery checklist</p>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {done}/{total} done
        </span>
      </div>
      <ul className="space-y-2">
        {RECOVERY_STEPS.map((step) => {
          const isOn = Boolean(checked[step.id]);
          return (
            <li key={step.id} className="flex items-start gap-2">
              <Checkbox
                id={`recovery-${step.id}`}
                checked={isOn}
                onCheckedChange={(v) => onToggle(step.id, v === true)}
                className="mt-0.5"
              />
              <label htmlFor={`recovery-${step.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span
                  className={`block text-xs ${isOn ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {step.label}
                </span>
                <span className="block text-[11px] text-muted-foreground">{step.detail}</span>
              </label>
              {isOn ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
