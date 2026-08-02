import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  trackCtaClick,
  trackAdPreviewEvent,
  AD_VIEW_DEPTH_MILESTONES,
  type AdPreviewEvent,
} from "@/lib/funnel";
import adVideo from "@/assets/pumppilot-ad.mp4.asset.json";
import adPoster from "@/assets/pumppilot-ad-poster.jpg.asset.json";
import robotImg from "@/assets/pumppilot-robot.png.asset.json";

type Props = {
  /** Where the sign-up CTA points */
  href: "/dashboard" | "/auth";
  label?: string;
};

/** Autoplaying (muted, looping) ad preview with the robot + sign-up CTA overlaid. */
export function AdPreview({ href, label = "Start free" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(true);
  // null until the media query is read on the client (avoids SSR mismatch).
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  /** Video bytes are only requested once the ad nears the viewport. */
  const [inView, setInView] = useState(false);
  /** Poster + skeleton stay up until the first frame is decodable. */
  const [ready, setReady] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      setReducedMotion(false);
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion === null || !inView) return;
    const el = videoRef.current;
    if (!el) return;
    if (reducedMotion) {
      // Respect the OS setting: hold on the poster frame until the user asks.
      el.pause();
      setPlaying(false);
      void trackAdPreviewEvent("reduced_motion_hold");
      return;
    }
    el.muted = true;
    void el
      .play()
      .then(() => {
        setPlaying(true);
        void trackAdPreviewEvent("autoplay_started");
      })
      .catch(() => {
        /* autoplay blocked — poster stays visible */
        void trackAdPreviewEvent("autoplay_blocked");
      });
  }, [reducedMotion, inView]);

  // Lazy-load trigger: start fetching the video slightly before it scrolls in.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  // Impression + scroll-depth milestones (25/50/75/100% of the ad in view).
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const seen = new Set<number>();
    let impressionSent = false;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!impressionSent && e.intersectionRatio >= 0.5) {
            impressionSent = true;
            void trackAdPreviewEvent("impression");
          }
          for (const m of AD_VIEW_DEPTH_MILESTONES) {
            if (seen.has(m)) continue;
            // allow a small tolerance so 100% fires on tall viewports
            if (e.intersectionRatio >= m - 0.02) {
              seen.add(m);
              void trackAdPreviewEvent(
                `view_depth_${Math.round(m * 100)}` as AdPreviewEvent,
              );
            }
          }
        }
        if (impressionSent && seen.size === AD_VIEW_DEPTH_MILESTONES.length) {
          obs.disconnect();
        }
      },
      { threshold: [0.25, 0.5, 0.75, 0.98, 1] },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);


  function startPlayback() {
    const el = videoRef.current;
    if (!el) return;
    setInView(true);
    void el.play().then(() => {
      setPlaying(true);
      void trackAdPreviewEvent("manual_play");
    });
  }

  function togglePlayback() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      startPlayback();
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    void trackAdPreviewEvent(el.muted ? "mute" : "unmute");
    void el.play().catch(() => {});
  }

  const showPoster = !ready || (reducedMotion === true && !playing);

  return (
    <div className="mx-auto w-full max-w-[340px]">
    <div
      ref={containerRef}
      role="group"
      tabIndex={0}
      aria-label="PumpPilot AI ad preview with playback controls"
      aria-describedby="ad-preview-shortcuts ad-preview-transcript-note"

      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        const onControl = !!target.closest("button, a, input");
        // Space/Enter belong to the focused control; letter shortcuts still work.
        if (e.key === " " && !onControl) {
          e.preventDefault();
          togglePlayback();
        } else if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          togglePlayback();
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleMute();
        }
      }}

      className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-3xl border border-emerald-500/25 bg-black shadow-2xl shadow-emerald-500/10"
    >

      <video
        ref={videoRef}
        className="block size-full object-cover"
        src={inView ? adVideo.url : undefined}
        poster={adPoster.url}
        autoPlay={inView && reducedMotion === false}
        loop
        muted={muted}
        playsInline
        preload={inView ? "auto" : "none"}
        onLoadedData={() => setReady(true)}
        onCanPlay={() => setReady(true)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => void trackAdPreviewEvent("complete")}
        aria-label="PumpPilot AI ad — the AI robot pumping crypto into a wallet while you sleep"
      />

      {/* Lightweight poster stand-in + skeleton while the video loads */}
      {showPoster && (
        <div className="absolute inset-0" aria-hidden="true">
          <img
            src={adPoster.url}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
            onLoad={() => setPosterLoaded(true)}
          />
          {(!posterLoaded || !ready) && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-emerald-500/10 via-black/60 to-black" />
          )}
        </div>
      )}

      {/* Reduced-motion fallback: static poster + explicit play control */}
      {reducedMotion && !playing && (
        <button
          type="button"
          onClick={startPlayback}
          className="absolute inset-x-0 top-0 flex h-3/5 flex-col items-center justify-center gap-2 text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-inset"
          aria-label="Play the PumpPilot AI ad. Motion is paused because your system prefers reduced motion. Keyboard shortcut: Space or K"
          aria-describedby="ad-preview-shortcuts"

        >
          <span className="rounded-full bg-emerald-500/90 p-4 shadow-lg shadow-emerald-500/40">
            <Play className="h-6 w-6 fill-current" />
          </span>
          <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] backdrop-blur">
            Motion paused — tap to play
          </span>
        </button>
      )}




      {/* bottom gradient so the CTA stays legible over any frame */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black via-black/70 to-transparent" />

      {/* Robot + overlaid sign-up button */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-6">
        <div className="relative">
          <img
            src={robotImg.url}
            alt="PumpPilot AI robot mascot"
            className="h-40 w-40 drop-shadow-[0_0_34px_rgba(16,185,129,0.5)] sm:h-44 sm:w-44"
            loading="lazy"
            decoding="async"
          />
          <Button
            size="lg"
            asChild
            onClick={(e) => {
              void trackCtaClick("hero-ad-overlay");
              void trackAdPreviewEvent("cta_click");
              // Smooth-scroll to the signup section and move focus to the
              // email field so keyboard/screen-reader users land on the form.
              const section = document.getElementById("signup");
              const field = document.getElementById("signup-email");
              if (!section) return;
              e.preventDefault();
              const reduce =
                typeof window !== "undefined" &&
                window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
              section.scrollIntoView({
                behavior: reduce ? "auto" : "smooth",
                block: "center",
              });
              window.setTimeout(
                () => (field ?? section).focus({ preventScroll: true }),
                reduce ? 0 : 500,
              );
            }}
            className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-7 text-base shadow-xl shadow-emerald-500/40"
          >
            <Link to={href}>
              {label} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

        </div>
        <p className="mt-3 text-[11px] text-white/70">
          No card. Paper trading by default.
        </p>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={
            playing
              ? "Pause the PumpPilot AI ad video. Keyboard shortcut: Space or K"
              : "Play the PumpPilot AI ad video. Keyboard shortcut: Space or K"
          }
          aria-describedby="ad-preview-shortcuts"
          aria-pressed={playing}
          title="Play or pause (Space or K)"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/60 p-2 text-white/80 backdrop-blur transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={
            muted
              ? "Unmute the PumpPilot AI ad video. Keyboard shortcut: M"
              : "Mute the PumpPilot AI ad video. Keyboard shortcut: M"
          }
          aria-describedby="ad-preview-shortcuts"
          aria-pressed={!muted}
          title="Mute or unmute (M)"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/60 p-2 text-white/80 backdrop-blur transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

        {/* Screen-reader status + keyboard instructions */}
        <p aria-live="polite" className="sr-only">
          {playing ? "Ad playing" : "Ad paused"}
          {muted ? ", muted" : ", sound on"}
        </p>
        <p id="ad-preview-shortcuts" className="sr-only">
          Keyboard shortcuts for this ad preview: press Space or K to play or pause the video, and
          press M to mute or unmute it. Shortcuts work while focus is anywhere inside the preview,
          including on these controls. Press Tab to reach the sign-up button below the video, then
          the text transcript.
        </p>
        <p id="ad-preview-transcript-note" className="sr-only">
          {hasCaptions
            ? "Captions are available for this video."
            : "Captions are not available for this video. A full text transcript of the ad is provided directly below the player."}
        </p>
      </div>

      <AdTranscript id="ad-preview-transcript" />
    </div>
  );
}

