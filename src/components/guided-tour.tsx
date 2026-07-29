import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/lib/onboarding-store";
import { useTour } from "@/lib/tour-store";
import { GraduationCap, X } from "lucide-react";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

export function GuidedTour() {
  const tour = useTour();
  const onboarding = useOnboarding();
  const navigate = useNavigate();
  const location = useLocation();
  const [rect, setRect] = useState<Rect | null>(null);

  const step = tour.step;

  // Auto-start the tour the first time someone opens paper trading or risk
  // controls — but never on top of the onboarding wizard.
  useEffect(() => {
    if (tour.seen || tour.active) return;
    if (!onboarding.state.completed) return;
    if (location.pathname !== "/paper" && location.pathname !== "/risk") return;
    const t = setTimeout(() => tour.start(), 600);
    return () => clearTimeout(t);
  }, [tour, onboarding.state.completed, location.pathname]);

  // Move to the route the current step lives on.
  useEffect(() => {
    if (!step) return;
    if (location.pathname !== step.path) {
      void navigate({ to: step.path });
    }
  }, [step, location.pathname, navigate]);

  // Track the spotlighted element.
  useLayoutEffect(() => {
    if (!step) {
      setRect(null);
      return;
    }
    if (!step.anchor || location.pathname !== step.path) {
      setRect(null);
      return;
    }

    let raf = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });

    const loop = () => {
      measure();
      raf = requestAnimationFrame(loop);
    };
    // Follow the element for a moment while the smooth scroll settles.
    loop();
    const stopAt = setTimeout(() => cancelAnimationFrame(raf), 900);

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stopAt);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, location.pathname]);

  if (!step) return null;

  const isLast = tour.index === tour.total - 1;
  const spotlight = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Place the card under the highlight when there is room, otherwise above it.
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const below = spotlight ? spotlight.top + spotlight.height + 14 : 0;
  const cardStyle: React.CSSProperties = spotlight
    ? below + 240 < viewportH
      ? { top: below }
      : { bottom: Math.max(16, viewportH - spotlight.top + 14) }
    : { top: "50%" };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {spotlight ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-emerald-400/80 transition-all duration-200"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(2, 6, 12, 0.78)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(2,6,12,0.78)]" />
      )}

      <div
        className="absolute mx-auto max-w-md rounded-xl border border-emerald-500/30 bg-card p-4 shadow-2xl sm:left-1/2 sm:right-auto sm:w-[26rem] sm:-translate-x-1/2"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
            <GraduationCap className="h-3.5 w-3.5" />
            Guided tour · {tour.index + 1} of {tour.total}
          </div>
          <button
            type="button"
            aria-label="Close tour"
            onClick={() => tour.stop()}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2 className="mt-2 text-base font-bold">{step.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${((tour.index + 1) / tour.total) * 100}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => tour.stop()}>
            Skip
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={tour.prev}
              disabled={tour.index === 0}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={tour.next}
              className="bg-emerald-500 text-black hover:bg-emerald-400"
            >
              {isLast ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small button that (re)starts the paper trading + risk controls tour. */
export function TourStartButton({ className }: { className?: string }) {
  const tour = useTour();
  return (
    <Button variant="outline" size="sm" className={className} onClick={tour.start}>
      <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
      Guided tour
    </Button>
  );
}
