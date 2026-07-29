/* ------------------------------------------------------------------ *
 * Timeline export preferences
 *
 * Remembers which CSV columns (and sections) a user last chose, keyed by
 * their account id so different users on the same device keep their own
 * layout. Falls back to a shared "anon" key when signed out.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import {
  allTimelineColumns,
  type TimelineColumnGroup,
  type TimelineColumnSelection,
} from "@/lib/timeline-export";

const PREFIX = "pumppilot.timeline-export-columns";

const keyFor = (userId: string | null) => `${PREFIX}.${userId ?? "anon"}`;

function read(userId: string | null): Required<TimelineColumnSelection> {
  const fallback = allTimelineColumns();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as TimelineColumnSelection;
    return {
      meta: Array.isArray(parsed.meta) ? parsed.meta : fallback.meta,
      risk: Array.isArray(parsed.risk) ? parsed.risk : fallback.risk,
      mitigation: Array.isArray(parsed.mitigation) ? parsed.mitigation : fallback.mitigation,
    };
  } catch {
    return fallback;
  }
}

/** Per-user CSV column selection, persisted to localStorage. */
export function useTimelineExportColumns() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [columns, setColumns] = useState<Required<TimelineColumnSelection>>(() => read(null));

  // Re-hydrate when the signed-in user changes (and after hydration on web).
  useEffect(() => {
    setColumns(read(userId));
  }, [userId]);

  const persist = useCallback(
    (next: Required<TimelineColumnSelection>) => {
      setColumns(next);
      try {
        window.localStorage.setItem(keyFor(userId), JSON.stringify(next));
      } catch {
        /* storage unavailable — keep the in-memory selection */
      }
    },
    [userId],
  );

  const toggleColumn = useCallback(
    (group: TimelineColumnGroup, key: string) => {
      const current = columns[group];
      const next = {
        ...columns,
        [group]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
      };
      persist(next);
    },
    [columns, persist],
  );

  const setGroup = useCallback(
    (group: TimelineColumnGroup, keys: string[]) => persist({ ...columns, [group]: keys }),
    [columns, persist],
  );

  const resetColumns = useCallback(() => persist(allTimelineColumns()), [persist]);

  return { columns, toggleColumn, setGroup, resetColumns };
}
