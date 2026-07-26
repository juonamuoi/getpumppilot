import type Stripe from "stripe";
import { assertValidUserId } from "@/lib/payments-validation";

type StripeCustomers = Pick<Stripe, "customers">;

/**
 * Resolve (or create) the Stripe Customer for a user, always stamping
 * `metadata.userId` so later lookups can be scoped to the owner.
 */
export async function resolveOrCreateCustomer(
  stripe: StripeCustomers,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId) assertValidUserId(options.userId);

  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }

  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const c = existing.data[0];
      if (options.userId && c.metadata?.userId !== options.userId) {
        await stripe.customers.update(c.id, {
          metadata: { ...c.metadata, userId: options.userId },
        });
      }
      return c.id;
    }
  }

  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}
