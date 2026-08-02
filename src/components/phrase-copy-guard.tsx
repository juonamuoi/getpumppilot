/* ------------------------------------------------------------------ *
 * Copy guard for the recovery phrase.
 *
 * Copying 12 words to the clipboard is the riskiest thing a user can do
 * with them, so it never happens on a single stray tap:
 *   1. an explicit confirm dialog with two acknowledgements,
 *   2. a short arming delay so the confirm button cannot be double-tapped,
 *   3. one copy only — afterwards the button locks, the clipboard is
 *      auto-cleared, and a re-copy needs a fresh cooldown + confirmation.
 * ------------------------------------------------------------------ */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Lock, ShieldAlert } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/** Seconds the confirm button stays disabled after the dialog opens. */
const ARM_SECONDS = 3;
/** Seconds before the clipboard is wiped again. */
const CLIPBOARD_CLEAR_SECONDS = 45;
/** Seconds you must wait before a second copy can even be requested. */
const RETRY_COOLDOWN_SECONDS = 30;

const ACKS = [
  "I am alone and no screen recording, sharing or remote session is active.",
  "I will paste this into an offline store only, and never into a website, chat or email.",
] as const;

function useCountdown(until: number | null) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export function PhraseCopyGuard({ phrase }: { phrase: string }) {
  const [open, setOpen] = useState(false);
  const [acks, setAcks] = useState<boolean[]>(() => ACKS.map(() => false));
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [copiedCount, setCopiedCount] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [clearAt, setClearAt] = useState<number | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armSecondsLeft = useCountdown(armedAt);
  const cooldownLeft = useCountdown(cooldownUntil);
  const clearLeft = useCountdown(clearAt);

  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  const allAcked = acks.every(Boolean);
  const locked = copiedCount > 0 && cooldownLeft > 0;

  function openDialog() {
    if (locked) return;
    setAcks(ACKS.map(() => false));
    setArmedAt(Date.now() + ARM_SECONDS * 1000);
    setOpen(true);
  }

  async function doCopy() {
    try {
      await navigator.clipboard.writeText(phrase);
    } catch {
      toast.error("Your browser blocked clipboard access — write the words down instead.");
      setOpen(false);
      return;
    }
    setOpen(false);
    setCopiedCount((n) => n + 1);
    setCooldownUntil(Date.now() + RETRY_COOLDOWN_SECONDS * 1000);
    const until = Date.now() + CLIPBOARD_CLEAR_SECONDS * 1000;
    setClearAt(until);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      void navigator.clipboard.writeText("").catch(() => undefined);
      setClearAt(null);
      toast.info("Clipboard cleared — the recovery phrase is no longer copied.");
    }, CLIPBOARD_CLEAR_SECONDS * 1000);
    toast.warning("Copied once. Paste it into your offline backup now — clipboard clears shortly.");
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={openDialog}
        disabled={locked}
        title={
          locked
            ? `Copy locked to prevent accidental repeats — retry in ${cooldownLeft}s`
            : "Requires confirmation"
        }
      >
        {locked ? (
          <Lock className="mr-1.5 h-3.5 w-3.5" />
        ) : copiedCount > 0 ? (
          <Check className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Copy className="mr-1.5 h-3.5 w-3.5" />
        )}
        {locked ? `Copy locked (${cooldownLeft}s)` : copiedCount > 0 ? "Copy again" : "Copy phrase"}
      </Button>

      {copiedCount > 0 && (
        <span className="text-[11px] text-muted-foreground">
          Copied {copiedCount}×.{" "}
          {clearLeft > 0
            ? `Clipboard clears in ${clearLeft}s.`
            : "Clipboard has been cleared."}
        </span>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Copy your recovery phrase to the clipboard?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The clipboard is readable by other apps and pages. Anyone who reads these 12 words can
              drain this wallet instantly. Writing them on paper is safer.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2.5">
            {ACKS.map((text, i) => (
              <label key={text} className="flex cursor-pointer items-start gap-2 text-xs">
                <Checkbox
                  checked={acks[i]}
                  onCheckedChange={(v) =>
                    setAcks((prev) => prev.map((a, idx) => (idx === i ? v === true : a)))
                  }
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">{text}</span>
              </label>
            ))}
            <p className="text-[11px] text-muted-foreground">
              The clipboard is wiped automatically {CLIPBOARD_CLEAR_SECONDS}s after copying.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!allAcked || armSecondsLeft > 0}
              onClick={(e) => {
                e.preventDefault();
                void doCopy();
              }}
            >
              {armSecondsLeft > 0
                ? `Wait ${armSecondsLeft}s…`
                : "I understand — copy to clipboard"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
