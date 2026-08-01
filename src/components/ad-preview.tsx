import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackCtaClick } from "@/lib/funnel";
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
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    void el.play().catch(() => {
      /* autoplay blocked — poster stays visible */
    });
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-3xl border border-emerald-500/25 bg-black shadow-2xl shadow-emerald-500/10">
      <video
        ref={videoRef}
        className="block h-auto w-full"
        src={adVideo.url}
        poster={adPoster.url}
        autoPlay
        loop
        muted={muted}
        playsInline
        preload="metadata"
        aria-label="PumpPilot AI ad — the AI robot pumping crypto into a wallet while you sleep"
      />

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
            onClick={() => void trackCtaClick("hero-ad-overlay")}
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

      <button
        type="button"
        onClick={() => {
          const el = videoRef.current;
          if (!el) return;
          el.muted = !el.muted;
          setMuted(el.muted);
          void el.play().catch(() => {});
        }}
        aria-label={muted ? "Unmute ad" : "Mute ad"}
        className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white/80 backdrop-blur transition hover:text-white"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
