import { describe, expect, it, vi } from "vitest";
import {
  fetchGoLiveTestSession,
  GO_LIVE_SESSION_NOT_FOUND,
} from "@/lib/go-live-session.server";

const OWNER = "user_owner_123";
const ATTACKER = "user_attacker_999";

function makeStripe(metadata: Record<string, string> | null) {
  const retrieve = vi.fn().mockResolvedValue({
    id: "cs_test_abc123",
    status: "complete",
    payment_status: "paid",
    amount_total: 1900,
    currency: "usd",
    metadata,
    payment_intent: {
      id: "pi_123",
      latest_charge: {
        id: "ch_123",
        statement_descriptor: "PUMP PILOT AI",
        receipt_url: "https://stripe.test/receipt",
        created: 1700000000,
        payment_method_details: { card: { last4: "4242", brand: "visa" } },
      },
    },
  });
  return { stripe: { checkout: { sessions: { retrieve } } } as any, retrieve };
}

describe("go-live session lookup ownership", () => {
  it("returns full details to the user who owns the session", async () => {
    const { stripe } = makeStripe({ userId: OWNER });
    const result = await fetchGoLiveTestSession(stripe, {
      sessionId: "cs_test_abc123",
      userId: OWNER,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.paymentStatus).toBe("paid");
    expect(result.statementDescriptor).toBe("PUMP PILOT AI");
    expect(result.chargeId).toBe("ch_123");
    expect(result.last4).toBe("4242");
  });

  it("denies another authenticated user and leaks no payment data", async () => {
    const { stripe } = makeStripe({ userId: OWNER });
    const result = await fetchGoLiveTestSession(stripe, {
      sessionId: "cs_test_abc123",
      userId: ATTACKER,
    });

    expect(result).toEqual({ error: GO_LIVE_SESSION_NOT_FOUND });
    const serialized = JSON.stringify(result);
    for (const secret of ["pi_123", "ch_123", "4242", "PUMP PILOT AI", "stripe.test/receipt", OWNER]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("denies sessions with no owner metadata", async () => {
    const { stripe } = makeStripe(null);
    await expect(
      fetchGoLiveTestSession(stripe, { sessionId: "cs_test_abc123", userId: ATTACKER }),
    ).resolves.toEqual({ error: GO_LIVE_SESSION_NOT_FOUND });
  });

  it("denies when the caller has no user id", async () => {
    const { stripe } = makeStripe({ userId: OWNER });
    await expect(
      fetchGoLiveTestSession(stripe, { sessionId: "cs_test_abc123", userId: "" }),
    ).resolves.toEqual({ error: GO_LIVE_SESSION_NOT_FOUND });
  });

  it("uses the caller-supplied session id verbatim (no id substitution)", async () => {
    const { stripe, retrieve } = makeStripe({ userId: OWNER });
    await fetchGoLiveTestSession(stripe, { sessionId: "cs_test_other", userId: ATTACKER });
    expect(retrieve).toHaveBeenCalledWith("cs_test_other", expect.anything());
  });
});
