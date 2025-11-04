import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";
import { encodeFunctionData, parseUnits, type Address, type Hex } from "viem";

export const schema = {
  fromTokenAmount: z.string().optional().describe("Amount of the source token (e.g., '10.0')"),
  fromTokenSymbol: z.string().optional().describe("Symbol of the source token (e.g., 'USDC')"),
  toTokenSymbol: z.string().optional().describe("Symbol of the destination token (e.g., 'ETH')"),
  transactionType: z.enum(["transfer", "swap"]).optional().default("swap").describe("Type of transaction: 'transfer' for simple ETH transfer, 'swap' for token swap"),
  recipientAddress: z.string().optional().describe("Recipient address for transfer (required for transfer type)"),
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
      return "Generate a mock transaction preview with transaction plan for testing purposes.";
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
  fromTokenAmount = "10.0",
  fromTokenSymbol = "USDC",
  toTokenSymbol = "ETH",
  transactionType = "swap",
  recipientAddress,
}: InferSchema<typeof schema>) {
  try {
    const chainId = "42161"; // Arbitrum
    const fromTokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address; // USDC on Arbitrum
    const toTokenAddress = "0x0000000000000000000000000000000000000000" as Address; // ETH (native)

    let txPlan: Array<{ to: Address; data: Hex; value: string; chainId: string }> = [];

    if (transactionType === "transfer") {
      // Simple ETH transfer
      if (!recipientAddress) {
        throw new Error("recipientAddress is required for transfer type");
      }
      const recipient = recipientAddress as Address;
      const amountInWei = parseUnits(fromTokenAmount || "1.0", 18);

      txPlan = [
        {
          to: recipient,
          data: "0x" as Hex, // Empty data for simple transfer
          value: amountInWei.toString(),
          chainId,
        },
      ];

      const txPreview = {
        fromTokenAmount: fromTokenAmount || "1.0",
        fromTokenSymbol: "ETH",
        fromTokenAddress: "0x0000000000000000000000000000000000000000",
        fromChain: "arbitrum",
        toTokenAmount: fromTokenAmount || "1.0",
        toTokenSymbol: "ETH",
        toTokenAddress: "0x0000000000000000000000000000000000000000",
        toChain: "arbitrum",
        recipientAddress: recipient,
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
    } else {
      // Token swap using encodeFunctionData
      const amountIn = parseUnits(fromTokenAmount, 6); // USDC has 6 decimals
      const amountOutMin = parseUnits("0.003", 18); // Minimum ETH out

      // Encode swap function call for Uniswap V2 Router
      const swapData = encodeFunctionData({
        abi: [
          {
            name: "swapExactTokensForETH",
            type: "function",
            stateMutability: "nonpayable",
            inputs: [
              { name: "amountIn", type: "uint256" },
              { name: "amountOutMin", type: "uint256" },
              { name: "path", type: "address[]" },
              { name: "to", type: "address" },
              { name: "deadline", type: "uint256" },
            ],
            outputs: [
              { name: "amounts", type: "uint256[]" },
            ],
          },
        ],
        functionName: "swapExactTokensForETH",
        args: [
          amountIn,
          amountOutMin,
          [fromTokenAddress, toTokenAddress],
          "0x0000000000000000000000000000000000000000" as Address,
          BigInt(Math.floor(Date.now() / 1000) + 3600), // deadline: 1 hour from now
        ],
      });

      // Uniswap V2 Router address on Arbitrum
      const routerAddress = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24" as Address;

      txPlan = [
        {
          to: routerAddress,
          data: swapData,
          value: "0",
          chainId,
        },
      ];

      const txPreview = {
        fromTokenAmount,
        fromTokenSymbol,
        fromTokenAddress,
        fromChain: "arbitrum",
        toTokenAmount: "0.003",
        toTokenSymbol,
        toTokenAddress,
        toChain: "arbitrum",
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
    }
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
  }
}
