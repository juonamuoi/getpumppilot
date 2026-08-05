/**
 * Dev-only snapshot stability invariant.
 *
 * `useSyncExternalStore` and selector hooks compare results by reference. A
 * getter that allocates a fresh array/object on every call re-renders forever
 * ("Maximum update depth exceeded"). These helpers surface that in development
 * with an actionable console warning instead of a cryptic React crash.
 *
 * All checks compile away to plain passthroughs in production builds.
 */
import { useRef, useSyncExternalStore } from "react";

const DEV = import.meta.env.DEV;

const warned = new Set<string>();

/** Frames belonging to the invariant itself or to React internals. */
const INTERNAL_FRAME =
  /(snapshot-invariant|react-dom|react\/jsx|node_modules\/react|\/@react-refresh)/;

/**
 * First application frame above the invariant — the store hook or component
 * that produced the unstable value. Returns e.g.
 * `useWalletAlerts (src/lib/wallet-alerts.ts:206:10)`.
 */
function callSite(): string {
  const stack = new Error().stack;
  if (!stack) return "unknown call site";
  const frames = stack.split("\n").slice(1);
  for (const raw of frames) {
    const frame = raw.trim().replace(/^at\s+/, "");
    if (!frame || INTERNAL_FRAME.test(frame)) continue;
    // Trim the origin so the path reads like a project-relative source path.
    return frame.replace(/https?:\/\/[^/]+\//g, "").replace(/\?[^):]*/g, "");
  }
  return "unknown call site";
}

/**
 * Names the parts of the value that were rebuilt, so the warning points at the
 * exact field instead of the whole snapshot. e.g. `.rules`, `.events`, `[0]`.
 */
function churnPaths(a: unknown, b: unknown, limit = 4): string {
  if (!isAllocated(a) || !isAllocated(b)) return "";
  if (Array.isArray(a)) {
    return a.length === 0 ? "[] (empty array literal)" : `[0..${a.length - 1}] (array rebuilt)`;
  }
  const keys = Object.keys(a as object);
  if (keys.length === 0) return "{} (empty object literal)";
  const changed = keys.filter(
    (k) =>
      !Object.is(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
  );
  const shown = (changed.length ? changed : keys).slice(0, limit).map((k) => `.${k}`);
  const more = (changed.length || keys.length) - shown.length;
  return `${shown.join(", ")}${more > 0 ? ` (+${more} more)` : ""}${
    changed.length ? "" : " (object wrapper rebuilt)"
  }`;
}

function warnOnce(
  label: string,
  message: string,
  detail?: { site: string; paths: string },
) {
  const key = detail ? `${label}@${detail.site}` : label;
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `[snapshot-invariant] store "${label}": ${message}` +
      (detail
        ? `\n  unstable path: ${detail.paths || "(root value)"}` +
          `\n  source: ${detail.site}`
        : ""),
  );
}

function isAllocated(value: unknown) {
  return typeof value === "object" && value !== null;
}

/** Shallow structural equality — used to detect "same data, new reference". */
function shallowEqual(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  if (!isAllocated(a) || !isAllocated(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    Object.is(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

/**
 * Call a snapshot getter twice and warn when the two results are structurally
 * equal but reference-unequal. Returns the first result.
 */
export function checkSnapshotStability<T>(getSnapshot: () => T, label: string) {
  const first = getSnapshot();
  if (!DEV) return first;
  const second = getSnapshot();
  if (
    !Object.is(first, second) &&
    isAllocated(first) &&
    shallowEqual(first, second)
  ) {
    warnOnce(
      label,
      "snapshot getter returns a new reference on every call while the data is " +
        "unchanged. Cache the value in a module-level variable (and hoist a " +
        "stable EMPTY constant for the server snapshot) or React will re-render " +
        "in a loop.",
      { site: callSite(), paths: churnPaths(first, second) },
    );
  }
  return first;
}

/**
 * Drop-in replacement for `useSyncExternalStore` that asserts snapshot
 * stability in development.
 */
export function useStableSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot: () => T,
  label: string,
): T {
  const checkedSnapshot = DEV
    ? () => checkSnapshotStability(getSnapshot, `${label} (client)`)
    : getSnapshot;
  const checkedServerSnapshot = DEV
    ? () => checkSnapshotStability(getServerSnapshot, `${label} (server)`)
    : getServerSnapshot;
  return useSyncExternalStore(
    subscribe,
    checkedSnapshot,
    checkedServerSnapshot,
  );
}

/**
 * Warn when a derived/selector value changes identity on every render while
 * its contents stay the same. Use inside components that feed the value to a
 * dependency array, memo, or effect.
 */
export function useStableSelector<T>(value: T, label: string): T {
  const previous = useRef<T | undefined>(undefined);
  const churn = useRef(0);
  if (DEV) {
    const prev = previous.current;
    if (
      prev !== undefined &&
      !Object.is(prev, value) &&
      isAllocated(value) &&
      shallowEqual(prev, value)
    ) {
      churn.current += 1;
      if (churn.current >= 3) {
        warnOnce(
          label,
          "selector produced a new reference on 3 consecutive renders with " +
            "identical contents. Wrap it in useMemo or return a cached value " +
            "to avoid render loops.",
          { site: callSite(), paths: churnPaths(prev, value) },
        );
      }
    } else {
      churn.current = 0;
    }
    previous.current = value;
  }
  return value;
}
