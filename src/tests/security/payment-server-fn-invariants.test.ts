import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * Guards against regressions where a payment server function stops using the
 * shared, tested primitives (ownership check, validated inputs, gateway client).
 */
describe("payment server function invariants", () => {
  const source = read("src/utils/payments.functions.ts");

  it("routes the go-live session lookup through the ownership-checked helper", () => {
    expect(source).toContain("fetchGoLiveTestSession");
    expect(source).not.toMatch(/checkout\.sessions\.retrieve/);
  });

  it("keeps every payment server function behind auth middleware", () => {
    const declarations = source.match(/createServerFn\(\{[^}]*\}\)([\s\S]*?)\.handler/g) ?? [];
    expect(declarations.length).toBeGreaterThanOrEqual(4);
    for (const decl of declarations) {
      expect(decl).toContain("requireSupabaseAuth");
    }
  });

  it("uses the shared validators instead of inline regexes", () => {
    expect(source).toContain("assertValidPriceId");
    expect(source).toContain("assertValidCheckoutSessionId");
    expect(source).toContain("assertValidGoLiveAmount");
  });

  it("never instantiates the Stripe SDK directly with a raw key", () => {
    expect(source).not.toMatch(/new Stripe\(/);
    expect(source).not.toContain("STRIPE_SECRET_KEY");
    expect(source).toContain("createStripeClient");
  });

  it("stamps userId metadata on checkout sessions so purchases stay attributable", () => {
    expect(source).toMatch(/metadata:\s*\{\s*userId/);
  });

  it("scopes the billing portal to the caller's own subscription row", () => {
    expect(source).toMatch(/\.eq\("user_id",\s*userId\)/);
  });
});
