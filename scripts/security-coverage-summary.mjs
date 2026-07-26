#!/usr/bin/env node
/**
 * Runs the security regression suite with coverage and writes a human-readable
 * summary (markdown + json) of which security invariants are actually exercised.
 *
 * Usage: bun run test:security:coverage
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outDirs = [join(root, "coverage", "security")];
const docsDir = "/mnt/documents";
if (existsSync(docsDir)) outDirs.push(docsDir);

console.log("Running security suite with coverage...");
const raw = execSync(
  "npx vitest run --config vitest.security.config.ts --coverage --reporter=json --outputFile=coverage/security/test-results.json",
  { cwd: root, stdio: ["ignore", "inherit", "inherit"], encoding: "utf8" },
);
void raw;

const results = JSON.parse(readFileSync(join(root, "coverage/security/test-results.json"), "utf8"));
const summary = JSON.parse(readFileSync(join(root, "coverage/security/coverage-summary.json"), "utf8"));

const pct = (m) => `${m.pct.toFixed(1)}%`;
const total = summary.total;

const files = Object.entries(summary)
  .filter(([k]) => k !== "total")
  .map(([file, m]) => ({ file: file.replace(`${root}/`, ""), m }))
  .sort((a, b) => a.file.localeCompare(b.file));

const suites = results.testResults.map((suite) => ({
  file: suite.name.replace(`${root}/`, ""),
  tests: suite.assertionResults.map((a) => ({
    title: [...(a.ancestorTitles ?? []), a.title].join(" › "),
    status: a.status,
  })),
}));

const passed = suites.flatMap((s) => s.tests).filter((t) => t.status === "passed").length;
const totalTests = suites.flatMap((s) => s.tests).length;
const generatedAt = new Date().toISOString();

const md = [
  "# PumpPilot AI — Security Test Coverage Summary",
  "",
  `Generated: ${generatedAt}`,
  "",
  `**Tests:** ${passed}/${totalTests} passing across ${suites.length} suites`,
  "",
  "## Coverage of security-critical modules",
  "",
  "| Module | Statements | Branches | Functions | Lines |",
  "| --- | --- | --- | --- | --- |",
  ...files.map(
    ({ file, m }) =>
      `| \`${file}\` | ${pct(m.statements)} | ${pct(m.branches)} | ${pct(m.functions)} | ${pct(m.lines)} |`,
  ),
  `| **Total** | **${pct(total.statements)}** | **${pct(total.branches)}** | **${pct(total.functions)}** | **${pct(total.lines)}** |`,
  "",
  "## Invariants exercised",
  "",
  ...suites.flatMap((s) => [
    `### \`${s.file}\``,
    "",
    ...s.tests.map((t) => `- ${t.status === "passed" ? "✅" : "❌"} ${t.title}`),
    "",
  ]),
].join("\n");

const json = { generatedAt, tests: { passed, total: totalTests }, coverage: summary, suites };

for (const dir of outDirs) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "security-coverage-summary.md"), md);
  writeFileSync(join(dir, "security-coverage-summary.json"), JSON.stringify(json, null, 2));
  console.log(`Wrote summary to ${dir}`);
}
