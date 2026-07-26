import { describe, expect, it } from "vitest";
import {
  assertValidCheckoutSessionId,
  assertValidGoLiveAmount,
  assertValidPriceId,
  assertValidUserId,
  GO_LIVE_MAX_CENTS,
  GO_LIVE_MIN_CENTS,
} from "@/lib/payments-validation";

describe("payment input validation (injection + abuse guards)", () => {
  it("accepts well-formed price ids", () => {
    for (const id of ["pro_monthly", "quant-yearly", "Plan123"]) {
      expect(assertValidPriceId(id)).toBe(id);
    }
  });

  it("rejects price ids containing separators or quotes", () => {
    for (const id of ["", "pro monthly", "pro'; --", "pro/../admin", "pro\nmonthly", "pro$(id)"]) {
      expect(() => assertValidPriceId(id)).toThrow(/Invalid priceId/);
    }
  });

  it("rejects user ids that could escape the Stripe search query string", () => {
    for (const id of ["u1' OR metadata['userId']:'u2", "u1'", "u 1", "u1;drop", ""]) {
      expect(() => assertValidUserId(id)).toThrow(/Invalid userId/);
    }
    expect(assertValidUserId("a1b2-c3_d4")).toBe("a1b2-c3_d4");
  });

  it("only accepts checkout session ids in Stripe's cs_ format", () => {
    expect(assertValidCheckoutSessionId("cs_test_abc123")).toBe("cs_test_abc123");
    for (const id of ["pi_123", "cs-test", "cs_", "cs_abc/../def", "' OR 1=1", ""]) {
      expect(() => assertValidCheckoutSessionId(id)).toThrow(/Invalid sessionId/);
    }
  });

  it("clamps the go-live test charge to a safe range", () => {
    expect(assertValidGoLiveAmount(GO_LIVE_MIN_CENTS)).toBe(GO_LIVE_MIN_CENTS);
    expect(assertValidGoLiveAmount(GO_LIVE_MAX_CENTS)).toBe(GO_LIVE_MAX_CENTS);
    for (const amount of [0, -100, 49]) {
      expect(() => assertValidGoLiveAmount(amount)).toThrow(/at least 50 cents/);
    }
    for (const amount of [501, 1_000_000]) {
      expect(() => assertValidGoLiveAmount(amount)).toThrow(/capped at \$5\.00/);
    }
    for (const amount of [100.5, NaN, Infinity]) {
      expect(() => assertValidGoLiveAmount(amount)).toThrow();
    }
  });
});
