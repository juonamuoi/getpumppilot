import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ASSETS } from "@/lib/mock-data";
// @ts-expect-error -- plain-JS helper shared with the sitemap build scripts
import { readSitemapUrlsXmlSync, parseLocs, SITEMAP_PARTS } from "../../../scripts/sitemap-parts.mjs";

const sitemap: string = readSitemapUrlsXmlSync(process.cwd());
const locs: string[] = parseLocs(sitemap);
const indexXml = readFileSync(path.resolve(process.cwd(), "public/sitemap.xml"), "utf8");

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

  it("lives in the dedicated asset sitemap listed by the index", () => {
    const assetsXml = readFileSync(path.resolve(process.cwd(), "public/sitemap-assets.xml"), "utf8");
    expect(parseLocs(assetsXml).length).toBe(ASSETS.length);
    expect(indexXml).toContain("<sitemapindex");
    for (const part of SITEMAP_PARTS as Array<{ file: string }>) {
      expect(indexXml).toContain(`/${part.file}</loc>`);
    }
  });
});
