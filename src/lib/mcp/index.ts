import { auth, defineMcp } from "@lovable.dev/mcp-js";
import momentumScan from "./tools/momentum-scan";
import listStrategies from "./tools/list-strategies";
import createStrategy from "./tools/create-strategy";
import subscriptionStatus from "./tools/subscription-status";

// The OAuth issuer must be the direct Supabase host; the project ref is inlined
// by Vite at build time and survives publish unchanged.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "pumppilot-ai-mcp",
  title: "PumpPilot AI",
  version: "0.1.0",
  instructions:
    "Tools for PumpPilot AI, a paper-trading crypto momentum dashboard. Use `momentum_scan` for explainable momentum scores, `list_strategies` to read saved or community strategies, `create_strategy` to save a new paper strategy, and `subscription_status` for the user's plan. All data is educational — never present it as investment advice, and no tool can execute live trades.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [momentumScan, listStrategies, createStrategy, subscriptionStatus],
});
