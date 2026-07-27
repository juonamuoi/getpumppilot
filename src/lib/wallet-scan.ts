/* ------------------------------------------------------------------ *
 * Wallet approval scanner — DEMO / mock data.
 *
 * On connect we simulate reading the wallet's outstanding token
 * approvals (spender allowances) and match each spender against a
 * known-phishing address list plus a set of heuristics (unlimited
 * allowance, freshly deployed drainer contracts, sanctioned mixers).
 *
 * Nothing here signs, moves or touches real funds, and the app never
 * asks for a seed phrase or private key. "Revoking" is simulated.
 * ------------------------------------------------------------------ */

export type ApprovalRisk = "critical" | "high" | "medium" | "safe";

export type WalletApproval = {
  id: string;
  /** Token whose spend is approved. */
  token: string;
  /** Contract/address allowed to spend. */
  spender: string;
  /** Friendly label for the spender, when known. */
  spenderLabel: string;
  /** Allowance in token units; null = unlimited. */
  allowance: number | null;
  /** Approximate value at risk, USD (mock). */
  valueAtRiskUsd: number;
  approvedAt: number;
  risk: ApprovalRisk;
  /** Plain-English reasons this was flagged. */
  reasons: string[];
  /** Heuristic identifiers that matched. */
  rules: string[];
};

export type WalletScanResult = {
  address: string;
  scannedAt: number;
  approvals: WalletApproval[];
  threats: WalletApproval[];
  /** Highest severity found. */
  worst: ApprovalRisk;
  totalValueAtRiskUsd: number;
};

/** Fictional demo blocklist of drainer / phishing spender addresses. */
export const PHISHING_ADDRESSES: Record<string, string> = {
  "0xDEmo0000dRa1nerC0ntract00000000000000001":
    "Known wallet-drainer contract seen in fake-airdrop campaigns (demo entry)",
  "0xDEmo0000pHishSpender0000000000000000002":
    "Spender linked to a PumpPilot AI impersonation site (demo entry)",
  "0xDEmo0000m1xerSanct10ned00000000000000003":
    "Sanctioned mixer used to launder drained funds (demo entry)",
};

const HOURS = 3600_000;
const DAYS = 24 * HOURS;

/** Deterministic mock approval set so the same wallet always scans the same. */
function mockApprovals(now: number): Omit<WalletApproval, "risk" | "reasons" | "rules">[] {
  return [
    {
      id: "ap-1",
      token: "USDC",
      spender: "0xDEmo0000dRa1nerC0ntract00000000000000001",
      spenderLabel: "Unverified contract",
      allowance: null,
      valueAtRiskUsd: 12480,
      approvedAt: now - 2 * DAYS,
    },
    {
      id: "ap-2",
      token: "DEMOCAT",
      spender: "0xDEmo0000pHishSpender0000000000000000002",
      spenderLabel: '"PumpPilot Airdrop Claim"',
      allowance: null,
      valueAtRiskUsd: 3120,
      approvedAt: now - 9 * HOURS,
    },
    {
      id: "ap-3",
      token: "WETH",
      spender: "0xDEmo00009fReshDeploy000000000000000004",
      spenderLabel: "Contract deployed 6h ago",
      allowance: null,
      valueAtRiskUsd: 8600,
      approvedAt: now - 6 * HOURS,
    },
    {
      id: "ap-4",
      token: "USDT",
      spender: "0xDEmo0000UniswapRouterLike000000000005",
      spenderLabel: "DEX router (verified, demo)",
      allowance: 2500,
      valueAtRiskUsd: 2500,
      approvedAt: now - 40 * DAYS,
    },
    {
      id: "ap-5",
      token: "SOL-DEMO",
      spender: "0xDEmo0000StakingVaultVerified00000000006",
      spenderLabel: "Staking vault (verified, demo)",
      allowance: 400,
      valueAtRiskUsd: 940,
      approvedAt: now - 120 * DAYS,
    },
  ];
}

function classify(
  a: Omit<WalletApproval, "risk" | "reasons" | "rules">,
  now: number,
): WalletApproval {
  const reasons: string[] = [];
  const rules: string[] = [];
  let risk: ApprovalRisk = "safe";

  const listed = PHISHING_ADDRESSES[a.spender];
  if (listed) {
    reasons.push(listed);
    rules.push("phishing-address-list");
    risk = "critical";
  }

  if (a.allowance === null) {
    reasons.push(
      "Unlimited spend approval — this address can move your entire balance of this token at any time.",
    );
    rules.push("unlimited-allowance");
    if (risk === "safe") risk = "high";
  }

  const ageHours = (now - a.approvedAt) / HOURS;
  if (!listed && ageHours < 24 && a.spenderLabel.toLowerCase().includes("deployed")) {
    reasons.push(
      "Spender contract is less than 24h old — a classic drainer pattern after a phishing signature request.",
    );
    rules.push("fresh-contract");
    if (risk !== "critical") risk = "high";
  }

  if (!listed && /airdrop|claim|verify|support/i.test(a.spenderLabel)) {
    reasons.push("Spender name mimics an official claim/support flow.");
    rules.push("impersonation-keywords");
    if (risk !== "critical") risk = "high";
  }

  return { ...a, risk, reasons, rules };
}

export const RISK_ORDER: ApprovalRisk[] = ["safe", "medium", "high", "critical"];

/**
 * Freshly-seen (demo) malicious spenders that background monitoring can
 * surface between scans, so periodic monitoring has something to catch.
 */
const EMERGING_APPROVALS: Omit<WalletApproval, "risk" | "reasons" | "rules">[] = [
  {
    id: "ap-e1",
    token: "DEMOCAT",
    spender: "0xDEmo0000pHishSpender0000000000000000002",
    spenderLabel: '"PumpPilot Reward Claim" (new)',
    allowance: null,
    valueAtRiskUsd: 4210,
    approvedAt: 0,
  },
  {
    id: "ap-e2",
    token: "USDC",
    spender: "0xDEmo0000newDra1ner00000000000000000007",
    spenderLabel: "Contract deployed 2h ago",
    allowance: null,
    valueAtRiskUsd: 6750,
    approvedAt: 0,
  },
  {
    id: "ap-e3",
    token: "WETH",
    spender: "0xDEmo0000supp0rtVerify00000000000000008",
    spenderLabel: '"Wallet Support Verify" portal',
    allowance: null,
    valueAtRiskUsd: 1980,
    approvedAt: 0,
  },
];

let emergingCursor = 0;

/**
 * Simulated on-chain approval scan. Async so the UI can show progress.
 *
 * `includeEmerging` is used by background monitoring: roughly every other
 * background sweep surfaces a newly-granted malicious approval (demo data)
 * so the new-threat notification path is exercised.
 */
export async function scanWallet(
  address: string,
  opts?: { includeEmerging?: boolean },
): Promise<WalletScanResult> {
  await new Promise((r) => setTimeout(r, 900));
  const now = Date.now();
  const base = mockApprovals(now);
  if (opts?.includeEmerging) {
    const extra = EMERGING_APPROVALS[emergingCursor % EMERGING_APPROVALS.length];
    emergingCursor += 1;
    if (emergingCursor % 2 === 1) {
      base.push({ ...extra, approvedAt: now - 30 * 60_000 });
    }
  }
  const approvals = base.map((a) => classify(a, now));

  const threats = approvals.filter((a) => a.risk !== "safe");
  const worst = threats.reduce<ApprovalRisk>(
    (acc, t) => (RISK_ORDER.indexOf(t.risk) > RISK_ORDER.indexOf(acc) ? t.risk : acc),
    "safe",
  );
  return {
    address,
    scannedAt: now,
    approvals,
    threats,
    worst,
    totalValueAtRiskUsd: threats.reduce((s, t) => s + t.valueAtRiskUsd, 0),
  };
}

/** Simulated revoke. Never signs anything — demo only. */
export async function revokeApproval(approval: WalletApproval): Promise<{ ok: true }> {
  await new Promise((r) => setTimeout(r, 700));
  void approval;
  return { ok: true };
}

export function shortAddress(a: string) {
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
}
