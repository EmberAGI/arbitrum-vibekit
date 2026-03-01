import type { Address, Hex } from "viem";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";
import { baseURL as rawBaseURL } from "@/config/baseUrl";
import { getAppsSdkCompatibleHtml, baseURL } from "@/lib/apps-sdk-html";

export const schema = {
  to: z.string().describe("Recipient address"),
  value: z.string().describe("Transaction value in wei"),
  chainId: z.string().describe("Chain ID as a string (e.g., '42161' for Arbitrum, '8453' for Base)"),
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
  rpcUrl: z
    .string()
    .url()
    .describe("RPC URL for the network"),
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
  _meta: {
    openai: {
      toolInvocation: {
        invoking: "Creating transaction preview",
        invoked: "Transaction preview ready",
      },
      widgetAccessible: true,
      resultCanProduceWidget: true,
      widgetDescription: "Transaction preview and signing interface",
      widgetPrefersBorder: true,
      widgetCSP: {
        connect_domains: [
          "https://app.beta.usecapsule.com",
          "connector_69153801992c8191842add9057bbd621.web-sandbox.oaiusercontent.com",
        ],
        resource_domains: ["https://app.beta.usecapsule.com"],
      },
    },
  },
};

function resolveBaseUrl(input?: string | null) {
  const value = input ?? rawBaseURL ?? "";
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

export default async function createTransactionPreview({
  to,
  value,
  chainId,
  data,
  gasLimit,
  maxFeePerGas,
  maxPriorityFeePerGas,
  rpcUrl,
}: InferSchema<typeof schema>) {
  try {
    const html = await getAppsSdkCompatibleHtml(baseURL, "/sign-transaction");

    const base = resolveBaseUrl();
    if (!base) {
      throw new Error(
        "Base URL is not configured. Ensure Vercel environment variables (VERCEL_URL/VERCEL_BRANCH_URL/VERCEL_PROJECT_PRODUCTION_URL) are set.",
      );
    }

    const url = `${base}/sign-transaction`;

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

    // Use the transaction plan as the preview
    const txPreview = txPlan;

    const result = {
      success: true,
      url,
      rpcUrl,
      txPreview,
      txPlan,
    };

    const isOpenAI = isOpenAIClient();

    if (isOpenAI) {
      return {
        content: [
          {
            type: "text",
            text: `<html>${html}</html>`,
          },
        ],
        structuredContent: result,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      structuredContent: result,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to create transaction preview";

    const result = {
      success: false,
      error: errorMessage,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      structuredContent: result,
      isError: true,
    };
  }
}
