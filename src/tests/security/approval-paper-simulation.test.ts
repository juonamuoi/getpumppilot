import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateLiveTrading } from "@/lib/live-trading";
import { submitOverwrite, type TokenApproval } from "@/lib/token-approvals";
import {
  clearSimulations,
  latestByApproval,
  projectApprovals,
  simulateOverwrite,
} from "@/lib/approval-simulation";

const OWNER = "0x1111111111111111111111111111111111111111";

const erc20: TokenApproval = {
  id: "erc20:0xtoken:0xspender",
  kind: "erc20",
  contract: "0xtoken",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  spender: "0xspender",
  allowance: (1n << 256n) - 1n,
  allowanceAmount: Number.MAX_SAFE_INTEGER,
  unlimited: true,
  balance: 500,
  lastBlock: 10,
  chainId: 1,
  txHash: "0xdeadbeef",
  source: "onchain-log-scan",
  scannedAt: 1_700_000_000_000,
};

const operator: TokenApproval = {
  ...erc20,
  id: "operator:0xnft:0xmarket",
  kind: "operator",
  contract: "0xnft",
  symbol: "NFT",
  decimals: 0,
  spender: "0xmarket",
  allowance: 1n,
};

describe("approval paper simulation", () => {
  beforeEach(() => {
    clearSimulations();
    updateLiveTrading({ mode: "paper" });
  });

  it("blocks on-chain approval writes while the live switch is off", async () => {
    const send = vi.fn();
    await expect(submitOverwrite(erc20, { type: "revoke" }, OWNER)).rejects.toThrow(/Paper mode/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("records a revoke without sending a transaction", () => {
    const entry = simulateOverwrite(erc20, { type: "revoke" }, OWNER, 1);
    expect(entry.nextAllowance).toBe("0");
    expect(entry.data.startsWith("0x095ea7b3")).toBe(true);
    expect(entry.simHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("projects a simulated revoke out of the list", () => {
    simulateOverwrite(erc20, { type: "revoke" }, OWNER, 1);
    const sims = latestByApproval(
      [...[simulateOverwrite(operator, { type: "revoke" }, OWNER, 1)]],
      OWNER,
      1,
    );
    expect(projectApprovals([operator], sims)).toHaveLength(0);
  });

  it("projects a spending cap onto the allowance", () => {
    const entry = simulateOverwrite(erc20, { type: "limit", amount: "100" }, OWNER, 1);
    const sims = latestByApproval([entry], OWNER, 1);
    const [projected] = projectApprovals([erc20], sims);
    expect(projected?.allowanceAmount).toBe(100);
    expect(projected?.unlimited).toBe(false);
    expect(projected?.simulated?.id).toBe(erc20.id);
  });

  it("ignores simulations from another wallet or chain", () => {
    const entry = simulateOverwrite(erc20, { type: "revoke" }, OWNER, 1);
    expect(latestByApproval([entry], "0x2222222222222222222222222222222222222222", 1).size).toBe(0);
    expect(latestByApproval([entry], OWNER, 8453).size).toBe(0);
  });

  it("clearing simulations restores the on-chain view", () => {
    simulateOverwrite(erc20, { type: "revoke" }, OWNER, 1);
    clearSimulations(OWNER);
    expect(latestByApproval([], OWNER, 1).size).toBe(0);
    expect(projectApprovals([erc20], new Map())).toEqual([erc20]);
  });
});
