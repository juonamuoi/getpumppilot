#!/usr/bin/env node
/**
 * Generates a compact snapshot of the official schema.org vocabulary used by
 * the CI structured-data validator (src/lib/schema-org-validate.ts).
 *
 * Source: https://schema.org/version/latest/schemaorg-current-https.jsonld
 *
 * Output: src/lib/schema-org-vocabulary.json
 *   {
 *     version: "<schema.org release>",
 *     generatedAt: "<ISO date>",
 *     types:      { "<Type>": ["<direct supertype>", ...] },
 *     properties: { "<property>": ["<domain type>", ...] },
 *     enumerations: ["<Enumeration member>", ...]
 *   }
 *
 * Usage:
 *   node scripts/gen-schema-vocabulary.mjs           # download + write
 *   node scripts/gen-schema-vocabulary.mjs --check   # fail if stale/missing
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const SOURCE = "https://schema.org/version/latest/schemaorg-current-https.jsonld";
const OUT = path.join("src", "lib", "schema-org-vocabulary.json");
const CHECK = process.argv.includes("--check");

const localName = (value) => {
  if (typeof value !== "string") return null;
  const raw = value
    .replace(/^https?:\/\/schema\.org\//, "")
    .replace(/^schema:/, "");
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(raw) ? raw : null;
};

/** Keeps prefixed vocabulary terms (rdfs:Class, rdf:Property) intact. */
const rawType = (value) =>
  typeof value === "string" ? value.replace(/^https?:\/\/schema\.org\//, "") : "";

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const ids = (v) => asArray(v).map((e) => localName(e?.["@id"] ?? e)).filter(Boolean);
const typesOf = (node) => asArray(node["@type"]).map((t) => rawType(t?.["@id"] ?? t));

async function build() {
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`schema.org fetch failed: ${response.status}`);
  const doc = await response.json();
  const graph = Array.isArray(doc["@graph"]) ? doc["@graph"] : [];

  const types = {};
  const properties = {};
  const enumerations = new Set();
  // schema.org's JSON-LD release carries no version field, so fingerprint the
  // downloaded vocabulary instead — that is what staleness checks compare.
  const version = `sha256:${createHash("sha256")
    .update(JSON.stringify(graph))
    .digest("hex")
    .slice(0, 12)}`;

  for (const node of graph) {
    const name = localName(node["@id"]);
    if (!name) continue;
    const nodeTypes = typesOf(node);

    if (nodeTypes.includes("Class") || nodeTypes.includes("rdfs:Class")) {
      types[name] = ids(node["rdfs:subClassOf"]);
    } else if (nodeTypes.includes("Property") || nodeTypes.includes("rdf:Property")) {
      properties[name] = ids(node["schema:domainIncludes"] ?? node["domainIncludes"]);
    } else if (nodeTypes.length > 0) {
      // Enumeration members such as InStock, OnlineEventAttendanceMode.
      enumerations.add(name);
    }
  }

  if (Object.keys(types).length < 500 || Object.keys(properties).length < 500) {
    throw new Error("schema.org snapshot looks incomplete — aborting");
  }

  const sortObj = (obj) =>
    Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k].sort()]));

  return {
    version,
    generatedAt: new Date().toISOString().slice(0, 10),
    types: sortObj(types),
    properties: sortObj(properties),
    enumerations: [...enumerations].sort(),
  };
}

const next = await build();

if (CHECK) {
  let current;
  try {
    current = JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    console.error(`Missing ${OUT} — run: node scripts/gen-schema-vocabulary.mjs`);
    process.exit(1);
  }
  const same =
    JSON.stringify(current.types) === JSON.stringify(next.types) &&
    JSON.stringify(current.properties) === JSON.stringify(next.properties);
  if (!same) {
    console.error(
      `schema.org vocabulary snapshot is stale (local ${current.version}, upstream ${next.version}).`,
    );
    process.exit(1);
  }
  console.log(`schema.org vocabulary up to date (${current.version}).`);
  process.exit(0);
}

await writeFile(OUT, `${JSON.stringify(next, null, 0)}\n`);
console.log(
  `Wrote ${OUT} — schema.org ${next.version}: ${Object.keys(next.types).length} types, ${Object.keys(next.properties).length} properties, ${next.enumerations.length} enumeration members.`,
);
