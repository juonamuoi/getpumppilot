/* ------------------------------------------------------------------ *
 * Recurring in-app reminder to finish the wallet recovery-phrase backup.
 *
 * Runs app-wide while a PumpPilot wallet exists and has not been marked
 * as backed up. Everything is local to this browser — no notifications
 * are sent anywhere.
 * ------------------------------------------------------------------ */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePumpWallet } from "@/lib/pump-wallet";
import {
  clearSchedule,
  ensureSchedule,
  markShown,
  requestOpenWallet,
  snooze,
  SNOOZE_OPTIONS,
} from "@/lib/backup-reminder";

const TICK_MS = 15_000;

export function WalletBackupReminder() {
  const { record } = usePumpWallet();
  const pending = Boolean(record && !record.backedUp);
  const [announcement, setAnnouncement] = useState("");
  const firing = useRef(false);

  useEffect(() => {
    if (!pending) {
      clearSchedule();
      return;
    }

    ensureSchedule();

    const check = () => {
      if (firing.current) return;
      const s = ensureSchedule();
      if (Date.now() < s.nextDueAt) return;

      firing.current = true;
      const next = markShown();
      const message =
        next.shown === 1
          ? "Finish securing your wallet"
          : `Still unsecured — reminder ${next.shown}`;

      setAnnouncement(
        "Reminder: your wallet recovery phrase is not confirmed as backed up offline.",
      );

      toast.warning(message, {
        id: "wallet-backup-reminder",
        duration: 20_000,
        description:
          "Your 12-word recovery phrase is not confirmed as backed up. Without it, losing this browser means losing the funds.",
        action: {
          label: "Finish backup",
          onClick: () => requestOpenWallet(),
        },
        cancel: {
          label: `Snooze ${SNOOZE_OPTIONS[0].label}`,
          onClick: () => {
            snooze(SNOOZE_OPTIONS[0].ms);
            toast.message(`Reminder snoozed for ${SNOOZE_OPTIONS[0].label.toLowerCase()}.`);
          },
        },
        onDismiss: () => {
          firing.current = false;
        },
        onAutoClose: () => {
          firing.current = false;
        },
      });

      // Safety net in case the toast never reports a close.
      window.setTimeout(() => {
        firing.current = false;
      }, 25_000);
    };

    check();
    const id = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(id);
  }, [pending]);

  useEffect(() => {
    if (!pending) setAnnouncement("");
  }, [pending]);

  return (
    <p aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );
}
