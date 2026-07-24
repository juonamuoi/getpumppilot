import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ *
 * PumpPilot AI — client-side security & anti-phishing layer.
 *
 * This is a DEMO protection layer for a paper-trading app. It does
 * not replace real wallet security or a browser-level phishing
 * blocker. Nothing here ever touches real keys — the app never
 * requests seed phrases or private keys.
 * ------------------------------------------------------------------ */

export type ReportKind =
  | "seed-phrase"
  | "private-key"
  | "phishing-domain"
  | "impersonation"
  | "malicious-link"
  | "suspicious-address"
  | "other";

export type Severity = "info" | "warn" | "critical";

export type Report = {
  id: string;
  ts: number;
  kind: ReportKind;
  severity: Severity;
  source: string; // where it originated ("wallet-connect", "paste", "link", "user")
  message: string;
  detail?: string;
  blocked: boolean;
};

export type SecuritySettings = {
  phishingBlockerEnabled: boolean;
  seedPhraseGuardEnabled: boolean;
  privateKeyGuardEnabled: boolean;
  linkScannerEnabled: boolean;
  autoReportEnabled: boolean;
  strictDomainCheck: boolean;
};

export type BlocklistEntry = {
  domain: string;
  reason: string;
  addedAt: number;
  source: "builtin" | "user" | "auto";
};

type ScanResult = {
  ok: boolean; // true if safe
  severity: Severity;
  matches: { kind: ReportKind; detail: string }[];
};

type Ctx = {
  settings: SecuritySettings;
  reports: Report[];
  blocklist: BlocklistEntry[];
  updateSettings: (partial: Partial<SecuritySettings>) => void;
  addBlockedDomain: (domain: string, reason?: string) => boolean;
  removeBlockedDomain: (domain: string) => void;
  clearReports: () => void;
  report: (input: Omit<Report, "id" | "ts">) => Report;
  scanText: (text: string, source?: string) => ScanResult;
  scanUrl: (url: string, source?: string) => ScanResult;
  checkOriginSafe: () => ScanResult;
  isDomainBlocked: (domain: string) => BlocklistEntry | null;
};

/* -------------------- Built-in phishing heuristics ------------------- */

// Fictional demo blocklist — clearly labeled to avoid confusion.
const BUILTIN_BLOCKLIST: BlocklistEntry[] = [
  {
    domain: "pumppilot-airdrop.example",
    reason: "Fake airdrop impersonating PumpPilot AI (demo entry)",
    addedAt: 0,
    source: "builtin",
  },
  {
    domain: "connect-pumppilot.example",
    reason: "Credential-harvesting clone (demo entry)",
    addedAt: 0,
    source: "builtin",
  },
  {
    domain: "wallet-verify.example",
    reason: "Fake wallet verification (demo entry)",
    addedAt: 0,
    source: "builtin",
  },
  {
    domain: "metamask-support.example",
    reason: "Impersonates wallet support — never legitimate",
    addedAt: 0,
    source: "builtin",
  },
  {
    domain: "seed-phrase-restore.example",
    reason: "Seed-phrase harvesting page",
    addedAt: 0,
    source: "builtin",
  },
];

// BIP-39 word list is ~2048 entries. We only need a small subset of
// common markers to flag likely seed phrases in pasted text.
const SEED_WORDS = new Set([
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
  "access", "accident", "account", "achieve", "acid", "across", "action", "actor",
  "actual", "adapt", "add", "address", "advance", "advice", "afford", "again",
  "agent", "ahead", "airport", "album", "alert", "alien", "all", "alley",
  "allow", "almost", "alone", "alpha", "also", "amateur", "among", "amount",
  "ancient", "angle", "animal", "answer", "anxiety", "apple", "april", "arena",
  "argue", "arm", "army", "around", "arrange", "arrive", "arrow", "article",
  "artist", "assist", "asset", "attack", "attend", "auction", "audit", "author",
  "avoid", "awake", "aware", "away", "baby", "bachelor", "bacon", "badge",
  "bag", "balance", "balcony", "ball", "bamboo", "banana", "banner", "bar",
  "basic", "battle", "beach", "bean", "bear", "become", "beef", "before",
  "begin", "behave", "behind", "believe", "below", "belt", "bench", "benefit",
  "best", "better", "between", "beyond", "bicycle", "bike", "bind", "bird",
  "birth", "black", "blade", "blame", "blast", "bleak", "bless", "blind",
  "blood", "blossom", "blue", "board", "body", "boil", "bomb", "bone",
  "book", "boost", "border", "boring", "borrow", "boss", "bottle", "bottom",
  "brain", "brand", "brass", "brave", "bread", "breeze", "brick", "bridge",
  "brief", "bright", "bring", "brisk", "broken", "bronze", "broom", "brother",
  "brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb",
  "bulk", "bullet", "bundle", "burden", "burger", "burst", "bus", "business",
]);

const PRIVATE_KEY_RE = /\b(0x)?[0-9a-fA-F]{64}\b/;
const MNEMONIC_RE = /\b([a-z]{3,10}\s+){11,23}[a-z]{3,10}\b/i;
const ETH_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/;
const IDN_HOMOGLYPH_RE = /(?:[а-яА-Я])|xn--/; // Cyrillic or punycode
const SUSPICIOUS_KEYWORDS = [
  "seed phrase",
  "recovery phrase",
  "private key",
  "wallet verify",
  "verify wallet",
  "airdrop claim",
  "claim reward",
  "unlock wallet",
  "sync wallet",
  "wallet migration",
];

const OFFICIAL_HOSTS = new Set([
  "pumppilot.ai",
  "app.pumppilot.ai",
  "localhost",
]);

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function looksLikeSeedPhrase(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!MNEMONIC_RE.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 12 || words.length > 24) return false;
  const hits = words.filter((w) => SEED_WORDS.has(w)).length;
  return hits / words.length >= 0.4; // 40%+ overlap with BIP-39 sample
}

/* ---------------------------- React state ---------------------------- */

const Ctx = createContext<Ctx | null>(null);

const DEFAULT_SETTINGS: SecuritySettings = {
  phishingBlockerEnabled: true,
  seedPhraseGuardEnabled: true,
  privateKeyGuardEnabled: true,
  linkScannerEnabled: true,
  autoReportEnabled: true,
  strictDomainCheck: true,
};

export function SecurityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SecuritySettings>(DEFAULT_SETTINGS);
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>(BUILTIN_BLOCKLIST);
  const [reports, setReports] = useState<Report[]>([
    {
      id: "seed-r1",
      ts: Date.now() - 1000 * 60 * 60 * 26,
      kind: "phishing-domain",
      severity: "critical",
      source: "link-scanner",
      message: "Blocked navigation to pumppilot-airdrop.example",
      detail: "Domain on built-in phishing blocklist.",
      blocked: true,
    },
  ]);

  const updateSettings = useCallback((partial: Partial<SecuritySettings>) => {
    setSettings((s) => ({ ...s, ...partial }));
  }, []);

  const isDomainBlocked = useCallback(
    (domain: string) => {
      const d = normalizeDomain(domain);
      return blocklist.find((e) => d === e.domain || d.endsWith("." + e.domain)) ?? null;
    },
    [blocklist],
  );

  const addBlockedDomain = useCallback(
    (domain: string, reason = "User-reported") => {
      const d = normalizeDomain(domain);
      if (!d || !/\./.test(d)) return false;
      let added = false;
      setBlocklist((prev) => {
        if (prev.some((e) => e.domain === d)) return prev;
        added = true;
        return [
          { domain: d, reason, addedAt: Date.now(), source: "user" },
          ...prev,
        ];
      });
      return added;
    },
    [],
  );

  const removeBlockedDomain = useCallback((domain: string) => {
    const d = normalizeDomain(domain);
    setBlocklist((prev) => prev.filter((e) => !(e.domain === d && e.source !== "builtin")));
  }, []);

  const clearReports = useCallback(() => setReports([]), []);

  const report = useCallback((input: Omit<Report, "id" | "ts">) => {
    const r: Report = {
      ...input,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
    };
    setReports((prev) => [r, ...prev].slice(0, 500));
    return r;
  }, []);

  const scanText = useCallback(
    (text: string, source = "text"): ScanResult => {
      const matches: ScanResult["matches"] = [];
      if (settings.seedPhraseGuardEnabled && looksLikeSeedPhrase(text)) {
        matches.push({
          kind: "seed-phrase",
          detail: "Text looks like a 12–24 word recovery phrase.",
        });
      }
      if (settings.privateKeyGuardEnabled && PRIVATE_KEY_RE.test(text)) {
        matches.push({
          kind: "private-key",
          detail: "Text contains a 64-char hex string matching a private key.",
        });
      }
      const lower = text.toLowerCase();
      for (const k of SUSPICIOUS_KEYWORDS) {
        if (lower.includes(k)) {
          matches.push({
            kind: "impersonation",
            detail: `Suspicious phrase: "${k}"`,
          });
          break;
        }
      }
      // Report any embedded URL against blocklist
      const urlMatches = text.match(/https?:\/\/[^\s]+/gi) ?? [];
      for (const u of urlMatches) {
        const inner = scanUrlPure(u, blocklist, settings);
        if (!inner.ok) matches.push(...inner.matches);
      }
      if (matches.length === 0)
        return { ok: true, severity: "info", matches: [] };
      const severity: Severity = matches.some(
        (m) => m.kind === "seed-phrase" || m.kind === "private-key",
      )
        ? "critical"
        : "warn";
      if (settings.autoReportEnabled) {
        report({
          kind: matches[0].kind,
          severity,
          source,
          message:
            severity === "critical"
              ? "Blocked — potential credential leak in pasted text"
              : "Suspicious content detected",
          detail: matches.map((m) => m.detail).join(" · "),
          blocked: severity === "critical",
        });
      }
      return { ok: false, severity, matches };
    },
    [blocklist, settings, report],
  );

  const scanUrl = useCallback(
    (url: string, source = "link-scanner"): ScanResult => {
      const res = scanUrlPure(url, blocklist, settings);
      if (!res.ok && settings.autoReportEnabled) {
        report({
          kind: res.matches[0].kind,
          severity: res.severity,
          source,
          message: `Blocked link ${normalizeDomain(url)}`,
          detail: res.matches.map((m) => m.detail).join(" · "),
          blocked: res.severity !== "info",
        });
      }
      return res;
    },
    [blocklist, settings, report],
  );

  const checkOriginSafe = useCallback((): ScanResult => {
    if (typeof window === "undefined")
      return { ok: true, severity: "info", matches: [] };
    const host = window.location.hostname.toLowerCase();
    if (
      OFFICIAL_HOSTS.has(host) ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com") ||
      host === "127.0.0.1"
    )
      return { ok: true, severity: "info", matches: [] };
    if (settings.strictDomainCheck && IDN_HOMOGLYPH_RE.test(host)) {
      return {
        ok: false,
        severity: "critical",
        matches: [
          {
            kind: "phishing-domain",
            detail: `Origin ${host} uses non-ASCII / punycode characters (possible homograph attack)`,
          },
        ],
      };
    }
    if (isDomainBlocked(host)) {
      return {
        ok: false,
        severity: "critical",
        matches: [
          { kind: "phishing-domain", detail: `Origin ${host} is on the blocklist` },
        ],
      };
    }
    return { ok: true, severity: "info", matches: [] };
  }, [isDomainBlocked, settings.strictDomainCheck]);

  // On mount, verify the current origin once.
  useEffect(() => {
    const res = checkOriginSafe();
    if (!res.ok && settings.autoReportEnabled) {
      report({
        kind: res.matches[0].kind,
        severity: res.severity,
        source: "origin-check",
        message: "Origin flagged by phishing blocker",
        detail: res.matches.map((m) => m.detail).join(" · "),
        blocked: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      settings,
      reports,
      blocklist,
      updateSettings,
      addBlockedDomain,
      removeBlockedDomain,
      clearReports,
      report,
      scanText,
      scanUrl,
      checkOriginSafe,
      isDomainBlocked,
    }),
    [
      settings,
      reports,
      blocklist,
      updateSettings,
      addBlockedDomain,
      removeBlockedDomain,
      clearReports,
      report,
      scanText,
      scanUrl,
      checkOriginSafe,
      isDomainBlocked,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function scanUrlPure(
  url: string,
  blocklist: BlocklistEntry[],
  settings: SecuritySettings,
): ScanResult {
  const matches: ScanResult["matches"] = [];
  const host = normalizeDomain(url);
  if (!host) return { ok: true, severity: "info", matches: [] };
  const hit = blocklist.find((e) => host === e.domain || host.endsWith("." + e.domain));
  if (hit) {
    matches.push({
      kind: "phishing-domain",
      detail: `${host} — ${hit.reason}`,
    });
  }
  if (settings.linkScannerEnabled) {
    if (IDN_HOMOGLYPH_RE.test(host)) {
      matches.push({
        kind: "phishing-domain",
        detail: `${host} contains suspicious IDN / punycode characters`,
      });
    }
    // Look-alike of official host: e.g. "pumppi1ot", "pump-pilot.app.co"
    if (/pump[\-\.]?pi[l1|]ot/i.test(host) && !OFFICIAL_HOSTS.has(host)) {
      matches.push({
        kind: "impersonation",
        detail: `${host} looks like PumpPilot but isn't the official domain`,
      });
    }
  }
  if (matches.length === 0) return { ok: true, severity: "info", matches: [] };
  const severity: Severity = matches.some((m) => m.kind === "phishing-domain")
    ? "critical"
    : "warn";
  return { ok: false, severity, matches };
}

export function isEthAddress(v: string): boolean {
  return ETH_ADDRESS_RE.test(v.trim());
}

export function useSecurity(): Ctx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSecurity must be used within SecurityProvider");
  return v;
}
