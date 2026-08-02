export interface RecoveryStep{id:string;label:string;detail:string}
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