import type { InferSchema } from "xmcp";
import { z } from "zod";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { baseURL as rawBaseURL } from "@/config/baseUrl";
import { requestContext } from "@/app/mcp/route";

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
    if (!id && !email) {
      throw new Error("Provide either 'id' (UUID) or 'email'");
    }

    // Find target wallet record
    let target: { id: string; email: string } | undefined;

    if (id) {
      const [row] = await db
        .select({ id: pregenWallets.id, email: pregenWallets.email })
        .from(pregenWallets)
        .where(eq(pregenWallets.id, id))
        .limit(1);
      if (row) target = row as any;
    } else if (email) {
      const [row] = await db
        .select({ id: pregenWallets.id, email: pregenWallets.email })
        .from(pregenWallets)
        .where(
          and(eq(pregenWallets.email, email), isNull(pregenWallets.claimedAt)),
        )
        .limit(1);
      if (row) target = row as any;
    }

    if (!target) {
      throw new Error("Pregenerated wallet not found");
    }

    const base = resolveBaseUrl();
    if (!base) {
      throw new Error(
        "Base URL is not configured. Ensure Vercel environment variables (VERCEL_URL/VERCEL_BRANCH_URL/VERCEL_PROJECT_PRODUCTION_URL) are set.",
      );
    }

    const url = `${base}/claim-pregen-wallet/${target.id}`;

    const result = {
      success: true,
      url,
      wallet: {
        id: target.id,
        email: target.email,
      },
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const result = {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate claim URL",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}
