import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { getOpenSeoFailures } from "@/lib/seo-monitor.functions";

const SEEN_KEY = "pp.seo-alert.seen";

/**
 * In-app notifier for the scheduled SEO audit.
 *
 * Polls unacknowledged warning/critical alerts (admins only — the server
 * function returns an empty list for everyone else) and toasts once per new
 * failure, so a daily audit regression is visible without opening the monitor.
 */
export function SeoAlertNotifier() {
  const fetchFailures = useServerFn(getOpenSeoFailures);
  const seen = useRef<Set<string>>(new Set());
  const hydrated = useRef(false);

  const { data } = useQuery({
    queryKey: ["seo-open-failures"],
    queryFn: () => fetchFailures(undefined as never),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!hydrated.current) {
      try {
        const raw = localStorage.getItem(SEEN_KEY);
        if (raw) seen.current = new Set(JSON.parse(raw) as string[]);
      } catch {
        /* ignore */
      }
      hydrated.current = true;
    }

    const alerts = data ?? [];
    const fresh = alerts.filter((a) => !seen.current.has(a.id));
    if (fresh.length === 0) return;

    for (const a of fresh) seen.current.add(a.id);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current].slice(-300)));
    } catch {
      /* ignore */
    }

    const critical = fresh.filter((a) => a.severity === "critical").length;
    toast.error(
      `${fresh.length} new SEO ${fresh.length === 1 ? "failure" : "failures"} detected`,
      {
        icon: <BellRing className="h-4 w-4" />,
        description:
          fresh[0].message.slice(0, 140) +
          (fresh.length > 1 ? ` · +${fresh.length - 1} more${critical ? ` (${critical} critical)` : ""}` : ""),
        duration: 12_000,
        action: {
          label: "Review",
          onClick: () => {
            window.location.href = "/seo-monitor";
          },
        },
      },
    );
  }, [data]);

  return null;
}

/** Small badge for the monitor page header. */
export function SeoAlertBadge() {
  const fetchFailures = useServerFn(getOpenSeoFailures);
  const { data } = useQuery({
    queryKey: ["seo-open-failures"],
    queryFn: () => fetchFailures(undefined as never),
    retry: false,
    staleTime: 60_000,
  });
  const count = data?.length ?? 0;
  if (count === 0) return null;
  return (
    <Link
      to="/seo-monitor"
      className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive"
    >
      <BellRing className="h-3 w-3" />
      {count} open
    </Link>
  );
}
