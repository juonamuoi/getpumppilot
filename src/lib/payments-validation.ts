/**
 * Pure, dependency-free validators for payment server-function inputs.
 *
 * These live outside the server-function module so the security regression
 * suite can assert the exact rejection rules without booting Stripe or the
 * request pipeline. `payments.functions.ts` imports them so the tested rules
 * are the shipped rules.
 */

export const PRICE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const CHECKOUT_SESSION_ID_PATTERN = /^cs_[a-zA-Z0-9_]+$/;

export const GO_LIVE_MIN_CENTS = 50;
export const GO_LIVE_MAX_CENTS = 500;

export function assertValidPriceId(priceId: string): string {
  if (typeof priceId !== "string" || !PRICE_ID_PATTERN.test(priceId)) {
    throw new Error("Invalid priceId");
  }
  return priceId;
}

/** userId is interpolated into a Stripe Search query string — reject anything that could escape it. */
export function assertValidUserId(userId: string): string {
  if (typeof userId !== "string" || !USER_ID_PATTERN.test(userId)) {
    throw new Error("Invalid userId");
  }
  return userId;
}

export function assertValidCheckoutSessionId(sessionId: string): string {
  if (typeof sessionId !== "string" || !CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("Invalid sessionId");
  }
  return sessionId;
}

export function assertValidGoLiveAmount(amountInCents: number): number {
  if (!Number.isFinite(amountInCents) || !Number.isInteger(amountInCents)) {
    throw new Error("Amount must be a whole number of cents");
  }
  if (!amountInCents || amountInCents < GO_LIVE_MIN_CENTS) {
    throw new Error("Amount must be at least 50 cents");
  }
  if (amountInCents > GO_LIVE_MAX_CENTS) {
    throw new Error("Go-live test is capped at $5.00");
  }
  return amountInCents;
}
