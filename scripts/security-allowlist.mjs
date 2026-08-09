#!/usr/bin/env node
/**
 * Configurable advisory allowlist for the security finding gate.
 *
 * The gate hard-fails on exactly two findings: `open_dex_quote` and
 * `SUPA_function_search_path_mutable`. Everything else the scanners report is
 * advisory. This module lets those advisory items be *tracked and explained*
 * in `security/findings-allowlist.json` so CI output stays readable without
 * silencing anything that matters:
 *
 *   - an entry matches advisory messages by `match` (substring) or `pattern`
 *     (case-insensitive regex);
 *   - each entry must carry a `reason` and an `owner`;
 *   - `expires` (YYYY-MM-DD) is optional — once past, the entry stops
 *     acknowledging and its findings show up as unacknowledged again;
 *   - entries may never cover a gated finding. Attempting to do so is a
 *     configuration error and hard-fails the gate.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const GATED_FINDING_IDS = ["open_dex_quote", "SUPA_function_search_path_mutable"];

export const ALLOWLIST_PATH = join("security", "findings-allowlist.json");

/** Reads and parses the allowlist file. Missing file = empty allowlist. */
export function loadAllowlist(root = process.cwd()) {
  let raw;
  try {
    raw = readFileSync(join(root, ALLOWLIST_PATH), "utf8");
  } catch {
    return { entries: [], configErrors: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { entries: [], configErrors: [`${ALLOWLIST_PATH} is not valid JSON: ${err.message}`] };
  }
  return validateAllowlist(parsed);
}

/** Validates a parsed allowlist document. */
export function validateAllowlist(doc) {
  const configErrors = [];
  const list = Array.isArray(doc?.allow) ? doc.allow : [];
  if (!Array.isArray(doc?.allow)) {
    configErrors.push(`${ALLOWLIST_PATH} must contain an "allow" array.`);
    return { entries: [], configErrors };
  }

  const entries = [];
  const seen = new Set();
  list.forEach((entry, i) => {
    const at = `${ALLOWLIST_PATH} entry #${i + 1}`;
    if (!entry || typeof entry !== "object") {
      configErrors.push(`${at} must be an object.`);
      return;
    }
    const { id, match, pattern, reason, owner, expires } = entry;
    if (!id || typeof id !== "string") configErrors.push(`${at} is missing a string "id".`);
    if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
      configErrors.push(`${at} (${id ?? "?"}) needs a "reason" explaining why it is acceptable.`);
    }
    if (!owner || typeof owner !== "string") {
      configErrors.push(`${at} (${id ?? "?"}) needs an "owner" accountable for it.`);
    }
    if (!match && !pattern) {
      configErrors.push(`${at} (${id ?? "?"}) needs a "match" substring or a "pattern" regex.`);
    }
    if (id && GATED_FINDING_IDS.includes(id)) {
      configErrors.push(
        `${at} tries to allowlist gated finding "${id}". Gated findings can never be allowlisted.`,
      );
    }
    if (id && seen.has(id)) configErrors.push(`${at} duplicates id "${id}".`);
    if (id) seen.add(id);

    let regex = null;
    if (pattern) {
      try {
        regex = new RegExp(pattern, "i");
      } catch (err) {
        configErrors.push(`${at} (${id ?? "?"}) has an invalid "pattern": ${err.message}`);
      }
    }
    if (expires !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(expires))) {
      configErrors.push(`${at} (${id ?? "?"}) has an invalid "expires" date (use YYYY-MM-DD).`);
    }
    entries.push({ id, match, pattern, regex, reason, owner, expires: expires ?? null });
  });

  return { entries, configErrors };
}

function isExpired(entry, now) {
  if (!entry.expires) return false;
  const end = Date.parse(`${entry.expires}T23:59:59Z`);
  return Number.isFinite(end) ? now.getTime() > end : false;
}

function matches(entry, message) {
  if (entry.regex) return entry.regex.test(message);
  if (entry.match) return message.includes(entry.match);
  return false;
}

/**
 * Splits advisory messages into acknowledged (explained by a live allowlist
 * entry) and unacknowledged buckets. Neither bucket fails CI — only
 * `configErrors` and the gated findings do.
 */
export function applyAllowlist(advisory, allowlist, now = new Date()) {
  const entries = allowlist?.entries ?? [];
  const acknowledged = [];
  const unacknowledged = [];
  const expired = entries.filter((e) => isExpired(e, now));
  const live = entries.filter((e) => !isExpired(e, now));
  const used = new Set();

  for (const message of advisory ?? []) {
    const hit = live.find((e) => matches(e, message));
    if (hit) {
      used.add(hit.id);
      acknowledged.push({ message, id: hit.id, reason: hit.reason, owner: hit.owner, expires: hit.expires });
    } else {
      const staleHit = expired.find((e) => matches(e, message));
      unacknowledged.push(
        staleHit ? `${message} (allowlist entry "${staleHit.id}" expired ${staleHit.expires})` : message,
      );
    }
  }

  return {
    acknowledged,
    unacknowledged,
    expired: expired.map((e) => ({ id: e.id, expires: e.expires, owner: e.owner })),
    unusedEntries: live.filter((e) => !used.has(e.id)).map((e) => e.id),
    configErrors: allowlist?.configErrors ?? [],
  };
}
