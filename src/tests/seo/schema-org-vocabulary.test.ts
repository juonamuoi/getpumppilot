import { describe, expect, it } from "vitest";

import {
  checkSchemaOrg,
  isSchemaOrgProperty,
  isSchemaOrgType,
  propertyAppliesTo,
  typeAncestors,
  SCHEMA_ORG_VERSION,
} from "@/lib/schema-org-validate";

describe("schema.org vocabulary snapshot", () => {
  it("is loaded and non-trivial", () => {
    expect(SCHEMA_ORG_VERSION).toMatch(/^sha256:/);
    expect(isSchemaOrgType("WebPage")).toBe(true);
    expect(isSchemaOrgType("BlogPosting")).toBe(true);
    expect(isSchemaOrgProperty("headline")).toBe(true);
  });

  it("resolves the class hierarchy", () => {
    expect(typeAncestors("BlogPosting")).toEqual(
      expect.arrayContaining(["Article", "CreativeWork", "Thing"]),
    );
    expect(propertyAppliesTo("headline", ["BlogPosting"])).toBe(true);
    expect(propertyAppliesTo("headline", ["Organization"])).toBe(false);
  });
});

describe("checkSchemaOrg", () => {
  it("accepts valid structured data", () => {
    const report = checkSchemaOrg(
      [
        {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: "Momentum basics",
          datePublished: "2026-01-01",
          author: { "@type": "Organization", name: "PumpPilot AI" },
        },
      ],
      "unit",
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("flags unknown types as errors", () => {
    const report = checkSchemaOrg(
      [{ "@context": "https://schema.org", "@type": "CryptoMomentumThing", name: "x" }],
      "unit",
    );
    expect(report.errors.map((i) => i.code)).toContain("unknown-type");
  });

  it("flags unknown properties as errors", () => {
    const report = checkSchemaOrg(
      [{ "@context": "https://schema.org", "@type": "WebPage", pumpScore: 42 }],
      "unit",
    );
    expect(report.errors.map((i) => i.code)).toContain("unknown-property");
  });

  it("flags properties used on the wrong type as warnings", () => {
    const report = checkSchemaOrg(
      [{ "@context": "https://schema.org", "@type": "Organization", headline: "nope" }],
      "unit",
    );
    expect(report.warnings.map((i) => i.code)).toContain("property-domain-mismatch");
  });

  it("flags a non-schema.org @context", () => {
    const report = checkSchemaOrg([{ "@context": "https://example.com", "@type": "WebPage" }], "unit");
    expect(report.errors.map((i) => i.code)).toContain("invalid-context");
  });

  it("allows Google's query-input extension on SearchAction", () => {
    const report = checkSchemaOrg(
      [
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          url: "https://www.getpumppilot.app",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://www.getpumppilot.app/scanner?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        },
      ],
      "unit",
    );
    expect(report.issues).toEqual([]);
  });

  it("walks @graph documents", () => {
    const report = checkSchemaOrg(
      [
        {
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", name: "PumpPilot AI" },
            { "@type": "NotARealType", name: "bad" },
          ],
        },
      ],
      "unit",
    );
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].path).toContain("@graph[1]");
  });
});
