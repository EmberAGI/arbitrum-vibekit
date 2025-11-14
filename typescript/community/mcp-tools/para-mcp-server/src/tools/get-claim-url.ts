import { and, eq, isNull } from "drizzle-orm";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";
import { baseURL as rawBaseURL } from "@/config/baseUrl";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { getAppsSdkCompatibleHtml, baseURL } from "@/lib/apps-sdk-html";

// Helper to check if client is OpenAI
function isOpenAIClient(): boolean {
  const context = requestContext.getStore();
  return context?.userAgent?.includes("openai-mcp") ?? false;
}

// Define the schema for tool parameters
export const schema = {
  id: z
    .string()
    .uuid()
    .optional()
    .describe("UUID of the pregenerated wallet record (preferred)"),
  email: z
    .string()
    .email()
    .optional()
    .describe(
      "Email used when the pregenerated wallet was created (used if id is not provided)",
    ),
} satisfies Record<string, z.ZodTypeAny>;

// Define tool metadata
export const metadata = {
  get name() {
    const isOpenAI = isOpenAIClient();
    return isOpenAI ? "claim-url" : "get-claim-url";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "Return a URL the user can open to claim a pregenerated Para.";
    }
    return "Generate a claim URL for a pregenerated Para wallet. Accepts a wallet id (UUID) or email. Returns a fully-qualified URL pointing to the claim page (e.g. /claim-pregen-wallet/[id]).";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI ? "Claim URL" : "Get Claim URL";
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
    _meta: {
    openai: {
      toolInvocation: {
        invoking: "Loading claim url",
        invoked: "Claim url ready",
      },
      widgetAccessible: true,
      resultCanProduceWidget: true,
      widgetDescription: "Claim url viewer",
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

// Tool implementation
export default async function getClaimUrl({
  id,
  email,
}: InferSchema<typeof schema>) {
  try {
    const html = await getAppsSdkCompatibleHtml(baseURL, "/claim-pregen-wallet");
   

    const base = resolveBaseUrl();
    if (!base) {
      throw new Error(
        "Base URL is not configured. Ensure Vercel environment variables (VERCEL_URL/VERCEL_BRANCH_URL/VERCEL_PROJECT_PRODUCTION_URL) are set.",
      );
    }

    const url = `${base}/claim-pregen-wallet/${id}`;

    const result = {
      success: true,
      url,
      wallet: {
        id,
        email,
      },
    };

    

    return {
      content: [
        {
          type: "text",
          text: `<html>${html}</html>`,
        },
      ],
      structuredContent: result,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate claim URL";

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
