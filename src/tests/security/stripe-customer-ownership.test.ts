import { describe, expect, it, vi } from "vitest";
import { resolveOrCreateCustomer } from "@/lib/stripe-customer.server";

function makeStripe(overrides: Partial<Record<"search" | "list" | "update" | "create", any>> = {}) {
  const search = overrides.search ?? vi.fn().mockResolvedValue({ data: [] });
  const list = overrides.list ?? vi.fn().mockResolvedValue({ data: [] });
  const update = overrides.update ?? vi.fn().mockResolvedValue({ id: "cus_updated" });
  const create = overrides.create ?? vi.fn().mockResolvedValue({ id: "cus_new" });
  return { stripe: { customers: { search, list, update, create } } as any, search, list, update, create };
}

describe("Stripe customer resolution (ownership binding)", () => {
  it("refuses to build a search query from an unsafe userId", async () => {
    const { stripe, search, create } = makeStripe();
    await expect(
      resolveOrCreateCustomer(stripe, { userId: "victim' OR metadata['userId']:'attacker" }),
    ).rejects.toThrow(/Invalid userId/);
    expect(search).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("matches on userId metadata before falling back to email", async () => {
    const { stripe, search, list } = makeStripe({
      search: vi.fn().mockResolvedValue({ data: [{ id: "cus_owner" }] }),
    });
    await expect(resolveOrCreateCustomer(stripe, { userId: "user_1", email: "a@b.co" })).resolves.toBe("cus_owner");
    expect(search).toHaveBeenCalledWith({ query: "metadata['userId']:'user_1'", limit: 1 });
    expect(list).not.toHaveBeenCalled();
  });

  it("backfills userId metadata when an email match belongs to a different user", async () => {
    const { stripe, update } = makeStripe({
      list: vi.fn().mockResolvedValue({ data: [{ id: "cus_legacy", metadata: { userId: "old_user" } }] }),
    });
    await expect(resolveOrCreateCustomer(stripe, { userId: "user_1", email: "a@b.co" })).resolves.toBe("cus_legacy");
    expect(update).toHaveBeenCalledWith("cus_legacy", { metadata: { userId: "user_1" } });
  });

  it("always stamps userId metadata on newly created customers", async () => {
    const { stripe, create } = makeStripe();
    await expect(resolveOrCreateCustomer(stripe, { userId: "user_1", email: "a@b.co" })).resolves.toBe("cus_new");
    expect(create).toHaveBeenCalledWith({ email: "a@b.co", metadata: { userId: "user_1" } });
  });
});
