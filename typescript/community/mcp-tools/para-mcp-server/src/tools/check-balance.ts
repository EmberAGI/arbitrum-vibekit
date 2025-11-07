import { type Chain, createPublicClient, formatEther, http } from "viem";
import { arbitrumSepolia, baseSepolia } from "viem/chains";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";

// Helper to check if client is OpenAI
function isOpenAIClient(): boolean {
  const context = requestContext.getStore();
  return context?.userAgent?.includes("openai-mcp") ?? false;
}

// Supported networks mapping
const SUPPORTED_NETWORKS: Record<string, Chain> = {
  "base-sepolia": baseSepolia,
  "arbitrum-sepolia": arbitrumSepolia,
};

// Define the schema for tool parameters
export const schema = {
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format")
    .describe("The Ethereum address to check balance for (0x...)"),
  network: z
    .enum(["base-sepolia", "arbitrum-sepolia"])
    .describe(
      "The network to check balance on (base-sepolia or arbitrum-sepolia)",
    ),
  rpcUrl: z
    .string()
    .url()
    .optional()
    .describe("Optional custom RPC URL for the network"),
} satisfies Record<string, z.ZodTypeAny>;

// Define tool metadata
export const metadata = {
  get name() {
    const isOpenAI = isOpenAIClient();
    return isOpenAI ? "balance" : "check-balance";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "Check balance";
    }
    return "Check the native token balance (ETH) of an address on Base Sepolia or Arbitrum Sepolia testnet. Returns balance in both wei and ether units.";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI ? "Check Balance" : "Check Address Balance";
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

// Tool implementation
export default async function checkBalance({
  address,
  network,
  rpcUrl,
}: InferSchema<typeof schema>) {
  try {
    // Validate address format
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error(
        "Invalid address format. Must be a 42-character hex string starting with 0x",
      );
    }

    // Get chain configuration
    const chain = SUPPORTED_NETWORKS[network];
    if (!chain) {
      throw new Error(
        `Unsupported network: ${network}. Supported networks: ${Object.keys(SUPPORTED_NETWORKS).join(", ")}`,
      );
    }

    // Create public client
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Get balance
    const balanceWei = await publicClient.getBalance({
      address: address as `0x${string}`,
    });

    // Convert to ether for readability
    const balanceEther = formatEther(balanceWei);

    const result = {
      success: true,
      address,
      network,
      balance: {
        wei: balanceWei.toString(),
        ether: balanceEther,
      },
      chainId: chain.id,
      chainName: chain.name,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const result = {
      success: false,
      error: error instanceof Error ? error.message : "Failed to check balance",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}
