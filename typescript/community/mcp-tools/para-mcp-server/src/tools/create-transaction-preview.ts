import type { Address, Hex } from "viem";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";

export const schema = {
  to: z.string().describe("Recipient address"),
  value: z.string().describe("Transaction value in wei"),
  chainId: z
    .enum(["42161", "421614", "8453", "84532"])
    .describe(
      "Chain ID: 42161 (Arbitrum), 421614 (Arbitrum Sepolia), 8453 (Base), 84532 (Base Sepolia)",
    ),
  data: z.string().optional().describe("Transaction data (hex, optional)"),
  gasLimit: z
    .string()
    .optional()
    .describe("Gas limit (optional, will be estimated if not provided)"),
  maxFeePerGas: z
    .string()
    .optional()
    .describe("Max fee per gas in wei (optional)"),
  maxPriorityFeePerGas: z
    .string()
    .optional()
    .describe("Max priority fee per gas in wei (optional)"),
  previewData: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional additional data to display in the preview (can be any JSON object). If not provided, will show the transaction plan.",
    ),
};

function isOpenAIClient(): boolean {
  const context = requestContext.getStore();
  return context?.userAgent?.includes("openai-mcp") ?? false;
}

export const metadata = {
  get name() {
    const isOpenAI = isOpenAIClient();
    return isOpenAI ? "create-tx-preview" : "create-transaction-preview";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "Generate preview and plan for operations. Returns structured data for UI display.";
    }
    return "Create a transaction preview with transaction plan. Returns txPreview (display data) and txPlan (raw transaction data) for UI consumption. This does not execute transactions, only generates preview data.";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI
        ? "Create Transaction Preview"
        : "Create Transaction Preview";
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function createTransactionPreview({
  to,
  value,
  chainId,
  data,
  gasLimit,
  maxFeePerGas,
  maxPriorityFeePerGas,
  previewData,
}: InferSchema<typeof schema>) {
  try {
    // Convert transaction parameters to txPlan format
    const txPlan = [
      {
        to: to as Address,
        data: (data || "0x") as Hex,
        value,
        chainId,
        ...(gasLimit && { gasLimit }),
        ...(maxFeePerGas && { maxFeePerGas }),
        ...(maxPriorityFeePerGas && { maxPriorityFeePerGas }),
      },
    ];

    // Use previewData if provided, otherwise use txPlan as preview
    const txPreview = previewData || txPlan;

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
          : "Failed to create transaction preview",
      details:
        error instanceof Error && error.stack
          ? error.stack
          : "No additional details available",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}
