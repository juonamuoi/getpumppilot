import { useCallback, useRef, useState } from "react";

type Politeness = "polite" | "assertive";

/**
 * Screen-reader live announcements for trade execution events.
 * Returns a render-able region plus an `announce()` callback.
 */
export function useExecutionAnnouncer() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const seq = useRef(0);

  const announce = useCallback((message: string, level: Politeness = "polite") => {
    // Bump an invisible counter so repeated identical messages are re-read.
    seq.current += 1;
    const text = seq.current % 2 === 0 ? `${message}\u200B` : message;
    if (level === "assertive") setAssertive(text);
    else setPolite(text);
  }, []);

  const region = (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertive}
      </div>
    </>
  );

  return { announce, region };
}

/** Visible + announced badge describing which execution mode is active. */
export function ExecutionModeAnnouncer({ live }: { live: boolean }) {
  const label = live
    ? "Execution mode: LIVE. Orders route real swaps you sign in your wallet."
    : "Execution mode: PAPER. Orders are simulated with no wallet signature.";
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {label}
    </div>
  );
}
