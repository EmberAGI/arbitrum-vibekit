import { experimental_createMCPClient } from "@ai-sdk/mcp";
import type { Address, Hex } from "viem";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";

export const schema = {
  amount: z.string().describe("Amount of the source token (e.g., '1')"),
  amountType: z
    .enum(["exactIn", "exactOut"])
    .default("exactIn")
    .describe("Type of amount: 'exactIn' or 'exactOut'"),
  fromChain: z.string().describe("Source blockchain (e.g., 'arbitrum')"),
  fromToken: z.string().describe("Symbol of the source token (e.g., 'ETH')"),
  toChain: z.string().describe("Destination blockchain (e.g., 'arbitrum')"),
  toToken: z
    .string()
    .describe("Symbol of the destination token (e.g., 'USDC')"),
  walletAddress: z.string().describe("Wallet address for the swap transaction"),
  slippageTolerance: z
    .string()
    .optional()
    .default("0.5")
    .describe("Slippage tolerance percentage (e.g., '0.5')"),
  expiration: z
    .string()
    .optional()
    .describe("Transaction expiration time in seconds from now"),
} satisfies Record<string, z.ZodTypeAny>;

function isOpenAIClient(): boolean {
  const context = requestContext.getStore();
  return context?.userAgent?.includes("openai-mcp") ?? false;
}

export const metadata = {
  get name() {
    const isOpenAI = isOpenAIClient();
    return isOpenAI ? "create-mock-tx" : "create-mock-transaction";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "Generate a mock preview with plan for testing purposes.";
    }
    return "Generate a mock transaction preview with transaction plan for testing purposes. Returns a transaction preview showing token swap details and a transaction plan with raw transaction data.";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI ? "Create Mock Transaction" : "Create Mock Transaction";
    },
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
};

export default async function createMockTransaction({
  amount,
  amountType = "exactIn",
  fromChain,
  fromToken,
  toChain,
  toToken,
  walletAddress,
  slippageTolerance = "0.5",
  expiration,
}: InferSchema<typeof schema>) {
  let client:
    | Awaited<ReturnType<typeof experimental_createMCPClient>>
    | undefined;
  try {
    // Create MCP client to connect to Ember
    client = await experimental_createMCPClient({
      transport: {
        type: "http",
        url: "https://api.emberai.xyz/mcp",
      },
    });

    // Get the tools from the MCP server
    const tools = await client.tools();

    // Find the createSwap tool
    const createSwapTool = tools.createSwap;
    if (!createSwapTool) {
      throw new Error("createSwap tool not found in Ember MCP");
    }

    // Call the createSwap tool with input parameters
    const swapResult = await createSwapTool.execute(
      {
        amount,
        amountType,
        fromChain,
        fromToken,
        toChain,
        toToken,
        walletAddress,
        slippageTolerance,
        ...(expiration && { expiration }),
      },
      {
        toolCallId: "swap-call-1",
        messages: [],
      },
    );

    // Extract structured content from the swap result
    const swapData = swapResult as {
      structuredContent?: unknown;
    };

    if (!swapData.structuredContent) {
      throw new Error("No structuredContent in swap result");
    }

    const structuredContent = swapData.structuredContent as {
      fromToken: {
        tokenUid: { address: string; chainId: string };
        symbol: string;
      };
      toToken: {
        tokenUid: { address: string; chainId: string };
        symbol: string;
      };
      displayFromAmount: string;
      displayToAmount: string;
      transactions: Array<{
        to: string;
        data: string;
        value: string;
        chainId: string;
      }>;
    };

    // Extract transactions from Ember response
    const transactions = structuredContent.transactions;
    if (!transactions || !Array.isArray(transactions)) {
      throw new Error("No transactions in structuredContent");
    }

    // Convert Ember's transactions to txPlan format
    const txPlan = transactions.map(
      (tx: { to: string; data: string; value: string; chainId: string }) => ({
        to: tx.to as Address,
        data: tx.data as Hex,
        value: tx.value,
        chainId: tx.chainId,
      }),
    );

    // Build txPreview from structured content
    const txPreview = {
      fromTokenAmount: structuredContent.displayFromAmount,
      fromTokenSymbol: structuredContent.fromToken.symbol,
      fromTokenAddress: structuredContent.fromToken.tokenUid.address,
      fromChain,
      toTokenAmount: structuredContent.displayToAmount,
      toTokenSymbol: structuredContent.toToken.symbol,
      toTokenAddress: structuredContent.toToken.tokenUid.address,
      toChain,
    };

    const result = {
      artifacts: [
        {
          name: "transaction-preview",
          parts: [
            {
              data: {
                txPreview,
                txPlan,
              },
            },
          ],
        },
      ],
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const result = {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create mock transaction",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } finally {
    // Always close the MCP client
    if (client) {
      await client.close();
    }
  }
}
