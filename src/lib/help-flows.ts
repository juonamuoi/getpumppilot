/**
 * Step-by-step help flows for the two core product journeys.
 *
 * These arrays are the single source of truth for BOTH the visible
 * "How it works" instructions on the page and the HowTo JSON-LD — Google
 * requires the structured data to mirror what the user can actually see.
 */
import type { HowToStep } from "@/lib/structured-data";

export type HelpFlow = {
  name: string;
  description: string;
  path: string;
  totalTime: string;
  tools: string[];
  steps: HowToStep[];
};

export const PAPER_TRADING_FLOW: HelpFlow = {
  name: "How to paper trade crypto with PumpPilot AI",
  description:
    "Practise crypto trading with simulated cash in PumpPilot AI: pick an asset, size the position, place a simulated order and review the result — live execution stays locked.",
  path: "/paper",
  totalTime: "PT5M",
  tools: ["A PumpPilot AI account", "Demo market data (no wallet required)"],
  steps: [
    {
      name: "Confirm you are in paper mode",
      anchor: "step-mode",
      text: "Check the locked live-execution switch at the top of the Paper Trading page. Paper mode is the default and live execution is disabled, so no real orders are ever placed and no wallet keys are needed.",
    },
    {
      name: "Pick an asset",
      anchor: "step-asset",
      text: "Choose one of the demo assets — BTC, ETH, SOL, BNB or a fictional DEMO small-cap token. All prices are clearly labelled mock data.",
    },
    {
      name: "Size the position",
      anchor: "step-size",
      text: "Enter the quantity you want to simulate. The order preview shows the notional value against your simulated cash balance so you can keep each position inside your risk limits.",
    },
    {
      name: "Place the simulated order",
      anchor: "step-order",
      text: "Press Buy or Sell to fill the order against the mock price. The trade is recorded in your paper portfolio and costs one credit; nothing leaves a real wallet.",
    },
    {
      name: "Review positions and reset",
      anchor: "step-review",
      text: "Track open positions and unrealised P&L in the positions table, then use Reset portfolio to clear the sandbox and practise the flow again.",
    },
  ],
};

export const STRATEGY_BUILDER_FLOW: HelpFlow = {
  name: "How to build a momentum strategy in PumpPilot AI",
  description:
    "Compose momentum, volume and volatility thresholds into a paper trading strategy in PumpPilot AI, then backtest it on demo data before sharing it.",
  path: "/strategy",
  totalTime: "PT8M",
  tools: ["A PumpPilot AI account", "Demo market data (no wallet required)"],
  steps: [
    {
      name: "Name and describe the strategy",
      anchor: "step-name",
      text: "Give the strategy a clear name, a one-line description of the edge you are testing and tags so you can find it later in your library.",
    },
    {
      name: "Set the momentum threshold",
      anchor: "step-momentum",
      text: "Choose the minimum explainable momentum score an asset must reach before the paper engine will consider an entry. Higher thresholds mean fewer, higher-conviction signals.",
    },
    {
      name: "Add volume and volatility filters",
      anchor: "step-filters",
      text: "Require a minimum volume score to confirm participation and cap maximum volatility so the strategy avoids the most fragile setups.",
    },
    {
      name: "Choose the asset universe",
      anchor: "step-universe",
      text: "Decide whether the fictional DEMO small-cap tokens are included alongside the major demo assets, and whether the paper engine auto-rebalances.",
    },
    {
      name: "Backtest before you commit",
      anchor: "step-backtest",
      text: "Run the strategy through Backtesting to see hit rate, drawdown and signal counts on demo history. Results are probabilistic — they never guarantee future returns.",
    },
    {
      name: "Save or publish",
      anchor: "step-save",
      text: "Save the strategy to your account, or publish it to the community feed so other paper traders can review the rules you used.",
    },
  ],
};
