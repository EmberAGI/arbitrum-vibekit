import { defineSkill } from "arbitrum-vibekit-core";
import { z } from "zod";

export const tradingSkill = defineSkill({
  id: "allora-trading-skill",
  name: "Allora AI Trader",
  description: "A skill that trades based on price predictions from the Allora network.",
  tags: ["trading", "defi", "allora"],
  examples: ["Execute a trade based on the latest ETH price prediction"],
  inputSchema: z.object({
    // Define input schema for the skill if necessary, for now it's empty
    // as the main tool will have its own inputs.
  }),
  // The workflow tool will be added here later.
  tools: [],
}); 