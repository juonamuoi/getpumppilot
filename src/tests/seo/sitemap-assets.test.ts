import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ASSETS } from "@/lib/mock-data";

const sitemap = readFileSync(path.resolve(process.cwd(), "public/sitemap.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("sitemap asset coverage", () => {
  it("lists a detail URL for every demo token", () => {
    const missing = ASSETS.filter(
      (a) => !locs.includes(`https://www.getpumppilot.app/asset/${a.symbol.toLowerCase()}`),
    ).map((a) => a.symbol);
    expect(missing, "run `bun run gen:sitemap`").toEqual([]);
  });

  it("uses canonical lowercase asset paths with no duplicates", () => {
    const assetLocs = locs.filter((l) => l.includes("/asset/"));
    expect(assetLocs.length).toBe(ASSETS.length);
    expect(new Set(assetLocs).size).toBe(assetLocs.length);
    for (const loc of assetLocs) expect(loc).toBe(loc.toLowerCase());
  });
});
