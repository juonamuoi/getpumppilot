/**
 * Post-build indexing ping.
 *
 * After a production build we tell search engines which URLs changed so the
 * new content is crawled in hours instead of days:
 *
 *   Bing / Yandex / Seznam  -> IndexNow  (https://api.indexnow.org/indexnow)
 *   Google                  -> Indexing API (urlNotifications:publish)
 *
 * Google's legacy `/ping?sitemap=` endpoint was retired in 2023, so the only
 * supported push channel is the Indexing API, which needs a service account.
 * When credentials are absent the corresponding channel is skipped with a
 * notice — a build must never fail because an external indexing endpoint is
 * unavailable or unconfigured.
 *
 * Only URLs whose sitemap <lastmod> changed since the previous successful ping
 * are submitted. State lives in `.indexing-state.json` (git-ignored); pass
 * `--all` to force a full resubmit, `--dry-run` to preview.
 *
 * Usage:
 *   node scripts/ping-indexing.mjs [--all] [--dry-run] [--json]
 *
 * Env:
 *   INDEXNOW_KEY                            32+ char key (auto-generated if unset)
 *   GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON    service account JSON (raw or base64)
 *   INDEXING_PING_DISABLED=1                skip everything
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createSign, randomBytes } from "node:crypto";
import { BASE_URL, readSitemapUrlsXml } from "./sitemap-parts.mjs";

const ROOT = process.cwd();
const STATE_FILE = resolve(ROOT, ".indexing-state.json");
const args = process.argv.slice(2);
const FORCE_ALL = args.includes("--all");
const DRY_RUN = args.includes("--dry-run");
const AS_JSON = args.includes("--json");
const HOST = new URL(BASE_URL).host;

const log = (...m) => {
  if (!AS_JSON) console.log(...m);
};

/* ------------------------------------------------------------------ *
 * Sitemap -> { url, lastmod }
 * ------------------------------------------------------------------ */
async function readSitemapEntries() {
  const xml = await readSitemapUrlsXml(ROOT);
  const entries = [];
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block[1].match(/<loc>\s*([^<]+?)\s*<\/loc>/)?.[1];
    if (!loc) continue;
    const lastmod = block[1].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1] ?? "";
    entries.push({ url: loc, lastmod });
  }
  return entries;
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { urls: {} };
  }
}

/* ------------------------------------------------------------------ *
 * IndexNow
 * ------------------------------------------------------------------ */
async function resolveIndexNowKey() {
  const fromEnv = process.env.INDEXNOW_KEY?.trim();
  if (fromEnv && fromEnv.length >= 8) {
    await ensureKeyFile(fromEnv);
    return fromEnv;
  }
  // Reuse a previously generated key file so the hosted proof stays stable.
  const state = await readState();
  if (state.indexNowKey) {
    await ensureKeyFile(state.indexNowKey);
    return state.indexNowKey;
  }
  return randomBytes(16).toString("hex");
}

/** IndexNow requires the key to be served at https://host/<key>.txt. */
async function ensureKeyFile(key) {
  const file = resolve(ROOT, "public", `${key}.txt`);
  if (existsSync(file)) return;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${key}\n`, "utf8");
  log(`  · wrote IndexNow key proof public/${key}.txt`);
}

async function pingIndexNow(urls, key) {
  const body = {
    host: HOST,
    key,
    keyLocation: `${BASE_URL}/${key}.txt`,
    urlList: urls.slice(0, 10000),
  };
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  // 200/202 = accepted. 422 usually means the key proof is not live yet.
  return { ok: res.ok || res.status === 202, status: res.status, submitted: body.urlList.length };
}

/* ------------------------------------------------------------------ *
 * Google Indexing API
 * ------------------------------------------------------------------ */
function loadServiceAccount() {
  const raw =
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON ??
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_B64;
  if (!raw) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  try {
    const sa = JSON.parse(text);
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

const b64url = (input) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function googleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claim))}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(sa.private_key)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  return (await res.json()).access_token;
}

async function pingGoogle(urls, sa) {
  const token = await googleAccessToken(sa);
  let accepted = 0;
  const failures = [];
  // Indexing API is per-URL; keep concurrency modest to stay inside quota.
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ url, type: "URL_UPDATED" }),
      });
      if (res.ok) accepted += 1;
      else failures.push({ url, status: res.status });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
  return { accepted, failures };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
async function main() {
  const result = { skipped: false, changed: 0, indexnow: null, google: null };

  if (process.env.INDEXING_PING_DISABLED === "1") {
    result.skipped = "INDEXING_PING_DISABLED=1";
    return result;
  }

  const entries = await readSitemapEntries();
  if (entries.length === 0) {
    result.skipped = "no sitemap URLs found — run `bun run gen:sitemap` first";
    return result;
  }

  const state = await readState();
  const changed = FORCE_ALL
    ? entries
    : entries.filter((e) => state.urls?.[e.url] !== (e.lastmod || "no-lastmod"));

  result.changed = changed.length;
  log(`Indexing ping — ${changed.length}/${entries.length} URL(s) changed since last ping.`);
  if (changed.length === 0) return result;

  const urls = changed.map((e) => e.url);
  if (DRY_RUN) {
    urls.slice(0, 20).forEach((u) => log(`  · ${u}`));
    if (urls.length > 20) log(`  · …and ${urls.length - 20} more`);
    result.skipped = "dry run";
    return result;
  }

  // --- IndexNow (Bing, Yandex, Seznam, Naver) ---
  const key = await resolveIndexNowKey();
  try {
    const r = await pingIndexNow(urls, key);
    result.indexnow = r;
    log(r.ok ? `  ✓ IndexNow accepted ${r.submitted} URL(s)` : `  ! IndexNow responded ${r.status}`);
  } catch (err) {
    result.indexnow = { ok: false, error: String(err) };
    log(`  ! IndexNow ping failed: ${err}`);
  }

  // --- Google Indexing API ---
  const sa = loadServiceAccount();
  if (!sa) {
    result.google = { skipped: "GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON not set" };
    log("  · Google Indexing API skipped (no service account configured)");
  } else {
    try {
      const r = await pingGoogle(urls, sa);
      result.google = r;
      log(
        `  ${r.failures.length === 0 ? "✓" : "!"} Google accepted ${r.accepted}/${urls.length} URL(s)` +
          (r.failures.length ? ` — ${r.failures.length} failed` : ""),
      );
    } catch (err) {
      result.google = { ok: false, error: String(err) };
      log(`  ! Google Indexing API failed: ${err}`);
    }
  }

  // Record what we submitted so the next build only pings real changes.
  const nextUrls = { ...(state.urls ?? {}) };
  for (const e of changed) nextUrls[e.url] = e.lastmod || "no-lastmod";
  await writeFile(
    STATE_FILE,
    `${JSON.stringify({ indexNowKey: key, lastPingedAt: new Date().toISOString(), urls: nextUrls }, null, 2)}\n`,
    "utf8",
  );

  return result;
}

main()
  .then((result) => {
    if (AS_JSON) console.log(JSON.stringify(result, null, 2));
    // Never fail a build on a third-party indexing endpoint.
    process.exit(0);
  })
  .catch((err) => {
    console.error(`ping-indexing: ${err?.message ?? err}`);
    process.exit(0);
  });
