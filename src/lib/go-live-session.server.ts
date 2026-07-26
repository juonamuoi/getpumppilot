import type Stripe from "stripe";

export type GoLiveSessionDetails = {
  status: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  statementDescriptor: string | null;
  chargeId: string | null;
  receiptUrl: string | null;
  created: string | null;
  last4: string | null;
  brand: string | null;
};

export type GoLiveSessionResult = GoLiveSessionDetails | { error: string };

/** Generic message so callers cannot distinguish "not yours" from "does not exist". */
export const GO_LIVE_SESSION_NOT_FOUND = "Session not found";

/**
 * Retrieves a Checkout Session and returns its details ONLY when the session
 * belongs to the authenticated caller (session.metadata.userId === userId).
 */
export async function fetchGoLiveTestSession(
  stripe: Pick<Stripe, "checkout">,
  params: { sessionId: string; userId: string },
): Promise<GoLiveSessionResult> {
  const session = await stripe.checkout.sessions.retrieve(params.sessionId, {
    expand: ["payment_intent", "payment_intent.latest_charge"],
  });

  const ownerId = session.metadata?.userId;
  if (!ownerId || !params.userId || ownerId !== params.userId) {
    return { error: GO_LIVE_SESSION_NOT_FOUND };
  }

  const pi: any = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge: any = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;

  return {
    status: session.status ?? null,
    paymentStatus: session.payment_status ?? null,
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
    paymentIntentId: pi?.id ?? null,
    statementDescriptor:
      charge?.statement_descriptor ?? charge?.calculated_statement_descriptor ?? pi?.statement_descriptor ?? null,
    chargeId: charge?.id ?? null,
    receiptUrl: charge?.receipt_url ?? null,
    created: charge?.created ? new Date(charge.created * 1000).toISOString() : null,
    last4: charge?.payment_method_details?.card?.last4 ?? null,
    brand: charge?.payment_method_details?.card?.brand ?? null,
  };
}
