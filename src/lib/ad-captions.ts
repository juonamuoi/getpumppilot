/**
 * Caption tracks available for the PumpPilot AI ad preview.
 *
 * The English track ships as an uploaded asset; the translations are static
 * WebVTT files served from /captions. All tracks share the same cue timings as
 * the transcript in `src/components/ad-transcript.tsx`.
 */
import adCaptionsEn from "@/assets/pumppilot-ad.en.vtt.asset.json";

export type AdCaptionTrack = {
  /** BCP-47 language code used for the <track srcLang> attribute */
  code: string;
  /** Native-language label shown in the picker and the track list */
  label: string;
  /** English name, used for screen-reader announcements */
  englishName: string;
  src: string;
};

export const AD_CAPTION_TRACKS: AdCaptionTrack[] = [
  {
    code: "en",
    label: "English",
    englishName: "English",
    src: adCaptionsEn.url,
  },
  {
    code: "es",
    label: "Español",
    englishName: "Spanish",
    src: "/captions/pumppilot-ad.es.vtt",
  },
  {
    code: "fr",
    label: "Français",
    englishName: "French",
    src: "/captions/pumppilot-ad.fr.vtt",
  },
  {
    code: "pt-BR",
    label: "Português (BR)",
    englishName: "Brazilian Portuguese",
    src: "/captions/pumppilot-ad.pt-BR.vtt",
  },
];

export const DEFAULT_CAPTION_LANG = "en";

export function getCaptionTrack(code: string | null): AdCaptionTrack {
  return (
    AD_CAPTION_TRACKS.find((t) => t.code === code) ?? AD_CAPTION_TRACKS[0]
  );
}

/**
 * Best caption language for the visitor's browser, falling back to English.
 * Matches the exact tag first, then the base language (e.g. `pt` → `pt-BR`).
 */
export function preferredCaptionLang(languages: readonly string[]): string {
  for (const raw of languages) {
    const tag = raw.toLowerCase();
    const exact = AD_CAPTION_TRACKS.find((t) => t.code.toLowerCase() === tag);
    if (exact) return exact.code;
    const base = tag.split("-")[0];
    const partial = AD_CAPTION_TRACKS.find(
      (t) => t.code.toLowerCase().split("-")[0] === base,
    );
    if (partial) return partial.code;
  }
  return DEFAULT_CAPTION_LANG;
}

/** Caption text size options, mapped to the `video.cue-*` rules in styles.css. */
export type CaptionSize = "sm" | "md" | "lg" | "xl";

export const CAPTION_SIZES: { value: CaptionSize; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
];

/** Caption background options, mapped to the `video.cue-bg-*` rules. */
export type CaptionBg = "solid" | "dim" | "none";

export const CAPTION_BACKGROUNDS: {
  value: CaptionBg;
  label: string;
  hint: string;
}[] = [
  { value: "solid", label: "Solid black", hint: "highest contrast" },
  { value: "dim", label: "Dimmed", hint: "see more of the video" },
  { value: "none", label: "None (outlined text)", hint: "no box" },
];

export function captionAppearanceClass(size: CaptionSize, bg: CaptionBg) {
  return `cue-${size} cue-bg-${bg}`;
}
