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

function warnOnce(label: string, message: string) {
  if (warned.has(label)) return;
  warned.add(label);
  // eslint-disable-next-line no-console
  console.warn(`[snapshot-invariant] ${label}: ${message}`);
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
        );
      }
    } else {
      churn.current = 0;
    }
    previous.current = value;
  }
  return value;
}
