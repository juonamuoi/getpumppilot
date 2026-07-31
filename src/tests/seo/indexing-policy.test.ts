import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  INTERNAL_ROUTES,
  WALLET_GATED_ROUTES,
  indexPolicyFor,
  isIndexable,
  robotsDirectiveFor,
  canonicalFor,
} from "@/lib/indexing-policy";

describe("auth-aware indexing policy", () => {
  it("marks wallet-gated app surfaces noindex, follow", () => {
    for (const path of WALLET_GATED_ROUTES) {
      expect(indexPolicyFor(path)).toBe("gated");
      expect(robotsDirectiveFor(path)).toBe("noindex, follow");
    }
  });

  it("marks internal tooling noindex, nofollow", () => {
    for (const path of INTERNAL_ROUTES) {
      expect(robotsDirectiveFor(path)).toBe("noindex, nofollow");
    }
  });

  it("leaves public content indexable with a self-canonical", () => {
    for (const path of ["/", "/pricing", "/blog", "/learn", "/scanner", "/asset/btc"]) {
      expect(isIndexable(path)).toBe(true);
      expect(robotsDirectiveFor(path)).toBeNull();
      expect(canonicalFor(path)).toBe(`https://www.getpumppilot.app${path}`);
    }
  });

  it("normalises trailing slashes, case and absolute URLs", () => {
    expect(indexPolicyFor("https://www.getpumppilot.app/Dashboard/")).toBe("gated");
    expect(canonicalFor("/Pricing/")).toBe("https://www.getpumppilot.app/pricing");
  });

  it("keeps gated routes out of the sitemap but crawlable in robots.txt", async () => {
    const sitemap = [
      await readFile("public/sitemap-pages.xml", "utf8"),
      await readFile("public/sitemap-blog.xml", "utf8"),
      await readFile("public/sitemap-assets.xml", "utf8"),
    ].join("\n");
    const robots = await readFile("public/robots.txt", "utf8");
    for (const path of WALLET_GATED_ROUTES) {
      expect(sitemap).not.toContain(`<loc>https://www.getpumppilot.app${path}</loc>`);
      expect(robots).not.toMatch(new RegExp(`^Disallow: ${path}\\s*$`, "m"));
    }
  });

  it("disallows every internal route in robots.txt", async () => {
    const robots = await readFile("public/robots.txt", "utf8");
    for (const path of INTERNAL_ROUTES) {
      const prefix = path.split("/").slice(0, 2).join("/");
      expect(robots).toMatch(new RegExp(`^Disallow: ${prefix}`, "m"));
    }
  });
});
