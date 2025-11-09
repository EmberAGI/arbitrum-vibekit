import { CdpClient } from "@coinbase/cdp-sdk";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";

// Helper to check if client is OpenAI
function isOpenAIClient(): boolean {
  const context = requestContext.getStore();
  return context?.userAgent?.includes("openai-mcp") ?? false;
}

// Define the schema for tool parameters
export const schema = {
  address: z
    .string()
    .describe("The blockchain address to receive faucet tokens"),
  network: z
    .enum(["base-sepolia", "ethereum-sepolia"])
    .describe(
      "The network to request faucet tokens on. Supported networks: base-sepolia, ethereum-sepolia",
    ),
  token: z
    .enum(["eth", "usdc", "eurc", "cbbtc"])
    .describe("The token to request from the faucet. Supported tokens: eth (native), usdc (ERC-20), eurc (ERC-20), cbbtc (ERC-20)"),
} satisfies Record<string, z.ZodTypeAny>;

// Define tool metadata
export const metadata = {
  get name() {
    const isOpenAI = isOpenAIClient();
    return isOpenAI ? "request" : "request-faucet";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "Request for a given address.";
    }
    return "Request testnet tokens from a blockchain faucet. Accepts an address, network, and token. Returns the transaction hash of the faucet request.";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI ? "Request" : "Request Testnet Faucet";
    },
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
};

// Tool implementation
export default async function requestFaucet({
  address,
  network,
  token,
}: InferSchema<typeof schema>) {
  try {
    // Validate required fields
    if (!address || !network || !token) {
      throw new Error("Missing required fields: address, network, and token");
    }

    // Check CDP API credentials
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      throw new Error(
        "CDP API credentials not configured. Please set CDP_API_KEY_ID and CDP_API_KEY_SECRET in your .env file",
      );
    }

    // Initialize CDP client with credentials
    const cdp = new CdpClient({
      apiKeyId,
      apiKeySecret,
    });

    // Request faucet funds using CDP SDK
    const faucetResponse = await cdp.evm.requestFaucet({
      address,
      network,
      token,
    });

    const result = {
      success: true,
      transactionHash: faucetResponse.transactionHash,
      address,
      network,
      token,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const result = {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to request faucet",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}
