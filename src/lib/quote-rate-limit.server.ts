/**
 * Per-user throttle for the paid DEX aggregator key.
 *
 * A sliding window kept in worker memory: enough to stop a scripted caller
 * from burning the 0x quota with a tight loop, while leaving normal
 * re-quoting (roughly one call every 10-30s per open swap panel) untouched.
 */
const WINDOW_MS = 60_000;
const MAX_CALLS = 20;

const hits = new Map<string, number[]>();

export type QuoteRateVerdict =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export function checkQuoteRateLimit(userId: string): QuoteRateVerdict {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_CALLS) {
    hits.set(userId, recent);
    const oldest = recent[0] ?? now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  recent.push(now);
  hits.set(userId, recent);

  // Opportunistic cleanup so idle callers do not accumulate forever.
  if (hits.size > 5_000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }

  return { allowed: true, remaining: MAX_CALLS - recent.length };
}
