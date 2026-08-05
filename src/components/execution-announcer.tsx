import { useCallback, useRef, useState } from "react";
import { Volume2, VolumeX, Volume1, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAnnounceVerbosity,
  shouldAnnounce,
  VERBOSITY_OPTIONS,
  type AnnounceImportance,
} from "@/lib/announce-verbosity";
import {
  ALL_CATEGORIES,
  isCategoryEnabled,
  NOTIFY_CATEGORIES,
  useNotifyCategories,
  type NotifyCategory,
} from "@/lib/notify-categories";

type Politeness = "polite" | "assertive";

/**
 * Screen-reader live announcements for trade execution events.
 * Returns a render-able region plus an `announce()` callback.
 * Messages are filtered by the user's verbosity preference
 * (off / minimal / full) so live trading can stay quiet.
 */
export function useExecutionAnnouncer() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const seq = useRef(0);
  const { verbosity } = useAnnounceVerbosity();
  const verbosityRef = useRef(verbosity);
  verbosityRef.current = verbosity;
  const { categories } = useNotifyCategories();
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  const announce = useCallback(
    (
      message: string,
      level: Politeness = "polite",
      importance: AnnounceImportance = "detail",
      category?: NotifyCategory,
    ) => {
      if (!shouldAnnounce(verbosityRef.current, importance)) return;
      // Category filters let the user mute whole classes of notification.
      if (!isCategoryEnabled(categoriesRef.current, category)) return;
      // Bump an invisible counter so repeated identical messages are re-read.
      seq.current += 1;
      const text = seq.current % 2 === 0 ? `${message}\u200B` : message;
      if (level === "assertive") setAssertive(text);
      else setPolite(text);
    },
    [],
  );

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

  return { announce, region, verbosity };
}

/** Visible + announced badge describing which execution mode is active. */
export function ExecutionModeAnnouncer({ live }: { live: boolean }) {
  const { verbosity } = useAnnounceVerbosity();
  if (verbosity === "off") return null;
  const label = live
    ? "Execution mode: LIVE. Orders route real swaps you sign in your wallet."
    : "Execution mode: PAPER. Orders are simulated with no wallet signature.";
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {label}
    </div>
  );
}

const ICONS = {
  off: VolumeX,
  minimal: Volume1,
  full: Volume2,
} as const;

/**
 * Compact control for how verbose execution announcements are.
 * `variant="inline"` renders just the picker for toolbars.
 */
export function AnnouncementVerbosityControl({
  variant = "block",
  className,
}: {
  variant?: "block" | "inline";
  className?: string;
}) {
  const { verbosity, setVerbosity } = useAnnounceVerbosity();
  const { categories, toggle, setAll } = useNotifyCategories();
  const allOn = categories.length === ALL_CATEGORIES.length;
  const filtered = !allOn;
  const Icon = ICONS[verbosity];
  const active = VERBOSITY_OPTIONS.find((o) => o.value === verbosity);

  const picker = (
    <Select value={verbosity} onValueChange={(v) => setVerbosity(v as typeof verbosity)}>
      <SelectTrigger
        id="announce-verbosity"
        className={variant === "inline" ? "h-9 w-[150px]" : "w-full sm:w-[220px]"}
        aria-label="Execution announcement verbosity"
      >
        <span className="flex items-center gap-2 truncate">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {VERBOSITY_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (variant === "inline") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label={`Notifications: ${active?.label ?? verbosity}${
              filtered ? `, filtered to ${categories.length} of ${ALL_CATEGORIES.length} types` : ""
            }`}
            title="Notifications"
          >
            <span className="relative">
              <Bell className="h-5 w-5" aria-hidden="true" />
              {verbosity === "off" || categories.length === 0 ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-muted-foreground" />
              ) : filtered ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-caution" />
              ) : (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={verbosity}
            onValueChange={(v) => setVerbosity(v as typeof verbosity)}
          >
            {VERBOSITY_OPTIONS.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {active?.hint ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{active.hint}</p>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span>Show types</span>
            <button
              type="button"
              className="text-[11px] font-normal text-primary hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setAll(!allOn);
              }}
            >
              {allOn ? "None" : "All"}
            </button>
          </DropdownMenuLabel>
          {NOTIFY_CATEGORIES.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.value}
              checked={categories.includes(c.value)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) => toggle(c.value, Boolean(on))}
            >
              <span className="flex flex-col">
                <span>{c.label}</span>
                <span className="text-[11px] text-muted-foreground">{c.hint}</span>
              </span>
            </DropdownMenuCheckboxItem>
          ))}
          {categories.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              All notification types are hidden.
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className={className}>
      <Label htmlFor="announce-verbosity" className="text-sm font-medium">
        Execution announcements
      </Label>
      <p className="mt-1 text-xs text-muted-foreground">
        Controls how much of an order's progress is announced out loud by screen readers while you
        trade.
      </p>
      <div className="mt-3">{picker}</div>
      {active ? <p className="mt-2 text-xs text-muted-foreground">{active.hint}</p> : null}
      <p aria-live="polite" className="sr-only">
        {`Execution announcements set to ${active?.label ?? verbosity}.`}
      </p>
    </div>
  );
}
