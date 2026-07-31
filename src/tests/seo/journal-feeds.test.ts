import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { ATOM_PATH, RSS_PATH, buildAtom, buildRss, feedItems } from "@/lib/feed";
import { SITE_URL } from "@/lib/structured-data";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });
const asArray = <T,>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

describe("journal feeds", () => {
  const items = feedItems();

  it("includes every published journal post, newest first", () => {
    expect(items).toHaveLength(BLOG_POSTS.length);
    const times = items.map((i) => i.published.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("emits parseable RSS 2.0 with a self link and absolute item URLs", () => {
    const doc = parser.parse(buildRss(items));
    const channel = doc.rss.channel;
    expect(doc.rss["@version"]).toBe("2.0");
    expect(channel["atom:link"]["@href"]).toBe(`${SITE_URL}${RSS_PATH}`);
    const rssItems = asArray(channel.item);
    expect(rssItems).toHaveLength(items.length);
    for (const item of rssItems) {
      expect(String(item.link)).toMatch(new RegExp(`^${SITE_URL}/blog/[a-z0-9-]+$`));
      expect(String(item.guid["#text"])).toBe(String(item.link));
      expect(String(item.title).length).toBeGreaterThan(0);
      expect(new Date(String(item.pubDate)).toString()).not.toBe("Invalid Date");
      expect(String(item["content:encoded"]).length).toBeGreaterThan(200);
    }
  });

  it("emits parseable Atom 1.0 with stable ids and ISO timestamps", () => {
    const doc = parser.parse(buildAtom(items));
    const feed = doc.feed;
    expect(feed.id).toBe(`${SITE_URL}${ATOM_PATH}`);
    expect(new Date(String(feed.updated)).toISOString()).toBe(String(feed.updated));
    const self = asArray(feed.link).find((l: Record<string, string>) => l["@rel"] === "self");
    expect(self["@href"]).toBe(`${SITE_URL}${ATOM_PATH}`);
    const entries = asArray(feed.entry);
    expect(entries).toHaveLength(items.length);
    for (const entry of entries) {
      expect(String(entry.id)).toContain(`${SITE_URL}/blog/`);
      expect(new Date(String(entry.published)).toISOString()).toBe(String(entry.published));
      expect(String(entry.summary["#text"]).length).toBeGreaterThan(0);
    }
  });

  it("escapes XML-unsafe characters instead of breaking the document", () => {
    const xml = buildRss([
      {
        ...items[0],
        title: 'Risk & "reward" <tags>',
        description: "a & b",
      },
    ]);
    expect(xml).toContain("Risk &amp; &quot;reward&quot; &lt;tags&gt;");
    expect(() => parser.parse(xml)).not.toThrow();
  });
});
