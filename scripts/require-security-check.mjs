#!/usr/bin/env node
/**
 * Make the security scan a REQUIRED status check so pull requests cannot be
 * merged unless it passes.
 *
 * The workflow `.github/workflows/security-finding-scan.yml` publishes a check
 * run named exactly `security-scan`. Branch protection lives on GitHub (not in
 * the repo), so this script applies it through the REST API.
 *
 * Usage:
 *   GITHUB_TOKEN=<token with repo admin> \
 *   node scripts/require-security-check.mjs [--repo owner/name] [--branch main] [--check]
 *
 * --check  verify only; exits 1 if the check is not currently required.
 */
import { execSync } from "node:child_process";

const CHECK_NAME = "security-scan";
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const verifyOnly = args.includes("--check");
const branch = flag("branch", "main");

function detectRepo() {
  const explicit = flag("repo", process.env.GITHUB_REPOSITORY);
  if (explicit) return explicit;
  try {
    const url = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
    const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return null;
}

const repo = detectRepo();
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!repo) {
  console.error("require-security-check: could not determine the repository. Pass --repo owner/name.");
  process.exit(1);
}
if (!token) {
  console.error(
    "require-security-check: set GITHUB_TOKEN (or GH_TOKEN) to a token with admin rights on " + repo + ".",
  );
  process.exit(1);
}

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
};

const current = await api(`/branches/${encodeURIComponent(branch)}/protection`);
const existing = current.ok ? current.body : null;
const requiredNow = existing?.required_status_checks?.contexts ?? [];

if (verifyOnly) {
  if (requiredNow.includes(CHECK_NAME)) {
    console.log(`require-security-check: OK — "${CHECK_NAME}" is required on ${repo}@${branch}.`);
    process.exit(0);
  }
  console.error(
    `require-security-check: "${CHECK_NAME}" is NOT a required status check on ${repo}@${branch}` +
      (current.ok ? ` (required: ${requiredNow.join(", ") || "none"}).` : ` (no branch protection: ${current.status}).`),
  );
  process.exit(1);
}

// Preserve any protections already configured; only add our check.
const contexts = Array.from(new Set([...requiredNow, CHECK_NAME]));
const payload = {
  required_status_checks: {
    strict: existing?.required_status_checks?.strict ?? true,
    contexts,
  },
  enforce_admins: existing?.enforce_admins?.enabled ?? true,
  required_pull_request_reviews: existing?.required_pull_request_reviews
    ? {
        dismiss_stale_reviews: existing.required_pull_request_reviews.dismiss_stale_reviews ?? false,
        require_code_owner_reviews: existing.required_pull_request_reviews.require_code_owner_reviews ?? false,
        required_approving_review_count:
          existing.required_pull_request_reviews.required_approving_review_count ?? 0,
      }
    : null,
  restrictions: null,
};

const put = await api(`/branches/${encodeURIComponent(branch)}/protection`, {
  method: "PUT",
  body: JSON.stringify(payload),
});

if (!put.ok) {
  console.error(
    `require-security-check: failed to update protection on ${repo}@${branch} [${put.status}]: ` +
      (typeof put.body === "string" ? put.body : JSON.stringify(put.body)),
  );
  process.exit(1);
}

console.log(
  `require-security-check: "${CHECK_NAME}" is now required on ${repo}@${branch}. ` +
    `Required checks: ${(put.body?.required_status_checks?.contexts ?? contexts).join(", ")}`,
);
