/**
 * JSON-LD consistency validator.
 *
 * Shared by the CI guard (src/tests/seo/jsonld-consistency.test.ts) so every
 * route's structured data is checked for the same three failure classes:
 *
 *   1. Malformed nodes — missing @context/@type, empty graphs.
 *   2. Missing required fields for the schema.org types we actually emit.
 *   3. Broken URLs — relative, non-https, placeholder, or containing
 *      "undefined"/"null" from a bad template interpolation.
 */

export const CANONICAL_HOST = "www.getpumppilot.app";

/** Hosts allowed to appear in JSON-LD URLs (own site + known social profiles). */
const ALLOWED_EXTERNAL_HOSTS = [
  "schema.org",
  "x.com",
  "twitter.com",
  "github.com",
  "www.linkedin.com",
  "linkedin.com",
  "www.youtube.com",
];

/** Keys whose string values must be resolvable absolute URLs. */
const URL_KEYS = new Set([
  "url",
  "@id",
  "item",
  "logo",
  "image",
  "contentUrl",
  "sameAs",
  "target",
  "urlTemplate",
  "mainEntityOfPage",
]);

const PLACEHOLDER_PATTERNS = [
  "undefined",
  "null",
  "NaN",
  "example.com",
  "localhost",
  "your-domain",
  "TODO",
];

/** Required top-level fields per schema.org @type we emit. */
const REQUIRED_FIELDS: Record<string, string[]> = {
  WebPage: ["name", "url"],
  CollectionPage: ["name", "url"],
  AboutPage: ["name", "url"],
  ContactPage: ["name", "url"],
  ItemPage: ["name", "url"],
  WebSite: ["name", "url"],
  Organization: ["name", "url"],
  Article: ["headline", "author", "datePublished", "image"],
  BlogPosting: ["headline", "author", "datePublished", "image"],
  FAQPage: ["mainEntity"],
  BreadcrumbList: ["itemListElement"],
  HowTo: ["name", "step"],
  SoftwareApplication: ["name"],
  Product: ["name"],
};

export type JsonLdIssue = { path: string; message: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function checkUrl(value: string, path: string, issues: JsonLdIssue[]) {
  // Template URLs (SearchAction) legitimately contain a {placeholder}.
  const probe = value.replace(/\{[^}]+\}/g, "x");

  for (const bad of PLACEHOLDER_PATTERNS) {
    if (probe.toLowerCase().includes(bad.toLowerCase())) {
      issues.push({ path, message: `URL contains placeholder "${bad}": ${value}` });
      return;
    }
  }

  // Fragment-only @id values (e.g. "#organization") are not portable.
  if (!/^https?:\/\//.test(probe)) {
    issues.push({ path, message: `URL is not absolute: ${value}` });
    return;
  }
  if (!probe.startsWith("https://")) {
    issues.push({ path, message: `URL must use https: ${value}` });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(probe);
  } catch {
    issues.push({ path, message: `URL is not parseable: ${value}` });
    return;
  }

  if (/\s/.test(value)) {
    issues.push({ path, message: `URL contains whitespace: ${value}` });
  }
  if (parsed.host !== CANONICAL_HOST && !ALLOWED_EXTERNAL_HOSTS.includes(parsed.host)) {
    issues.push({
      path,
      message: `URL host "${parsed.host}" is neither ${CANONICAL_HOST} nor an allow-listed external host: ${value}`,
    });
  }
  if (parsed.host === CANONICAL_HOST && parsed.pathname.includes("//")) {
    issues.push({ path, message: `URL has a doubled slash: ${value}` });
  }
}

function walk(node: unknown, path: string, issues: JsonLdIssue[]) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${path}[${i}]`, issues));
    return;
  }
  if (!isRecord(node)) return;

  const types = ([] as string[]).concat((node["@type"] as string | string[]) ?? []);

  // A node carrying only @type/@id is a reference to a node defined elsewhere
  // (e.g. publisher: { "@id": ORG_ID }); required fields live on the target.
  const isReference =
    typeof node["@id"] === "string" &&
    Object.keys(node).every((k) => k === "@id" || k === "@type" || k === "@context");

  for (const type of isReference ? [] : types) {

    for (const field of REQUIRED_FIELDS[type] ?? []) {
      const value = node[field];
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        issues.push({ path: `${path}.${field}`, message: `${type} is missing required field "${field}"` });
      }
    }
  }

  if (types.includes("FAQPage")) {
    const entities = Array.isArray(node.mainEntity) ? node.mainEntity : [];
    entities.forEach((q, i) => {
      const question = isRecord(q) ? q : {};
      const answer = isRecord(question.acceptedAnswer) ? question.acceptedAnswer : undefined;
      if (!question.name) {
        issues.push({ path: `${path}.mainEntity[${i}]`, message: "Question is missing name" });
      }
      if (!answer || typeof answer.text !== "string" || answer.text.trim() === "") {
        issues.push({
          path: `${path}.mainEntity[${i}].acceptedAnswer`,
          message: "Question is missing a non-empty acceptedAnswer.text",
        });
      }
    });
  }

  if (types.includes("BreadcrumbList")) {
    const items = Array.isArray(node.itemListElement) ? node.itemListElement : [];
    items.forEach((raw, i) => {
      const item = isRecord(raw) ? raw : {};
      if (item.position !== i + 1) {
        issues.push({
          path: `${path}.itemListElement[${i}]`,
          message: `ListItem position must be ${i + 1}, got ${String(item.position)}`,
        });
      }
      if (!item.name || !item.item) {
        issues.push({
          path: `${path}.itemListElement[${i}]`,
          message: "ListItem requires both name and item",
        });
      }
    });
  }

  if (types.includes("HowTo")) {
    const steps = Array.isArray(node.step) ? node.step : [];
    steps.forEach((raw, i) => {
      const step = isRecord(raw) ? raw : {};
      if (!step.name || !step.text) {
        issues.push({ path: `${path}.step[${i}]`, message: "HowToStep requires name and text" });
      }
    });
  }

  for (const [key, value] of Object.entries(node)) {
    const childPath = `${path}.${key}`;
    if (typeof value === "string" && URL_KEYS.has(key)) {
      checkUrl(value, childPath, issues);
      continue;
    }
    if (typeof value === "string" && value.trim() === "" && key !== "text") {
      issues.push({ path: childPath, message: "Empty string value" });
      continue;
    }
    walk(value, childPath, issues);
  }
}

/** Validate a single JSON-LD document (object or @graph). */
export function validateJsonLd(doc: unknown, label = "root"): JsonLdIssue[] {
  const issues: JsonLdIssue[] = [];

  if (!isRecord(doc) && !Array.isArray(doc)) {
    return [{ path: label, message: "JSON-LD document must be an object or array" }];
  }
  const docs = Array.isArray(doc) ? doc : [doc];

  for (const [i, entry] of docs.entries()) {
    const path = docs.length > 1 ? `${label}[${i}]` : label;
    if (!isRecord(entry)) {
      issues.push({ path, message: "JSON-LD entry must be an object" });
      continue;
    }
    if (entry["@context"] !== "https://schema.org") {
      issues.push({ path, message: `@context must be "https://schema.org"` });
    }
    const graph = entry["@graph"];
    if (graph !== undefined) {
      if (!Array.isArray(graph) || graph.length === 0) {
        issues.push({ path: `${path}.@graph`, message: "@graph must be a non-empty array" });
      }
    } else if (!entry["@type"]) {
      issues.push({ path, message: "Node is missing @type" });
    }
    walk(entry, path, issues);
  }

  return issues;
}

/** Parse a JSON-LD <script> body and validate it. Reports parse errors too. */
export function validateJsonLdSource(source: string, label: string): JsonLdIssue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    return [{ path: label, message: `Invalid JSON: ${(err as Error).message}` }];
  }
  return validateJsonLd(parsed, label);
}
