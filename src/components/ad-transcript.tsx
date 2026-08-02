/**
 * Text transcript fallback for the PumpPilot ad video.
 *
 * The rendered ad has no caption (WebVTT) track, so this transcript is the
 * accessible equivalent of the audio + on-screen text. It is always available
 * in the DOM (inside a <details> disclosure) so screen-reader and
 * captions-dependent users can read the full ad content.
 */

export type AdTranscriptLine = {
  /** Timestamp label, e.g. "0:00" */
  at: string;
  /** What is shown on screen */
  visual: string;
  /** Narration / on-screen copy */
  said: string;
};

export const AD_TRANSCRIPT: AdTranscriptLine[] = [
  {
    at: "0:00",
    visual: "A dark chart screen with a green candle spiking off the top.",
    said: "Missed another pump while you were asleep?",
  },
  {
    at: "0:03",
    visual: "The PumpPilot robot mascot powers on, eyes glowing green.",
    said: "PumpPilot AI watches the market for you, around the clock.",
  },
  {
    at: "0:06",
    visual: "The market scanner lists tokens with momentum scores climbing.",
    said: "It scores momentum on every token and ranks what is actually moving.",
  },
  {
    at: "0:09",
    visual: "A rule impact panel shows thresholds, matches and near-misses.",
    said: "Every alert comes with receipts: the exact rule that fired, and why.",
  },
  {
    at: "0:12",
    visual:
      "The robot pumps glowing coins into a wallet while a person sleeps in bed.",
    said: "You set the risk limits. The copilot does the watching.",
  },
  {
    at: "0:15",
    visual:
      "The PumpPilot AI logo with the sign-up call to action on a dark background.",
    said: "Spot momentum. Control risk. Trade smarter. Start free — paper trading by default, no card required.",
  },
];

export function AdTranscript({ id }: { id: string }) {
  return (
    <details
      id={id}
      className="mt-3 rounded-2xl border border-border/60 bg-card/40 px-4 py-3 text-left"
    >
      <summary className="cursor-pointer text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
        Read the ad transcript (captions unavailable)
      </summary>
      <p className="mt-2 text-[11px] text-muted-foreground">
        This video has no caption track. The full text of what is shown and said
        is below.
      </p>
      <ol className="mt-2 space-y-2">
        {AD_TRANSCRIPT.map((line) => (
          <li key={line.at} className="text-[11px] leading-relaxed">
            <span className="font-mono text-muted-foreground">{line.at}</span>{" "}
            <span className="text-foreground">{line.said}</span>{" "}
            <span className="text-muted-foreground">({line.visual})</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
