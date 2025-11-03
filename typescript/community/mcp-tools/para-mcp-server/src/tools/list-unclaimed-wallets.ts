import type { InferSchema } from "xmcp";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { isNull } from "drizzle-orm";
import { requestContext } from "@/app/mcp/route";

// Define the schema for tool parameters (no parameters needed)
export const schema = {} as const;

// Helper to check if client is OpenAI
function isOpenAIClient(): boolean {
  const context = requestContext.getStore();
  return context?.userAgent?.includes("openai-mcp") ?? false;
}

// Define tool metadata
export const metadata = {
  get name() {
    const isOpenAI = isOpenAIClient();
    return isOpenAI ? "list-unclaimed" : "list-unclaimed-wallets";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "List all pregenerated Para that have not been claimed yet. Returns complete details including  creation date for each unclaimed.";
    }
    return "List all pregenerated Para wallets that have not been claimed yet. Returns complete wallet details including email, wallet address, wallet ID, wallet type, and creation date for each unclaimed wallet in the database.";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI ? "List Unclaimed" : "List Unclaimed Wallets";
    },
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

// Tool implementation
export default async function listUnclaimedWallets(
  _params: InferSchema<typeof schema>,
) {
  try {
    // Query database for unclaimed wallets
    const unclaimedWallets = await db
      .select({
        id: pregenWallets.id,
        email: pregenWallets.email,
        walletAddress: pregenWallets.walletAddress,
        walletId: pregenWallets.walletId,
        walletType: pregenWallets.walletType,
        createdAt: pregenWallets.createdAt,
      })
      .from(pregenWallets)
      .where(isNull(pregenWallets.claimedAt));

    const result = {
      success: true,
      count: unclaimedWallets.length,
      wallets: unclaimedWallets.map((wallet) => ({
        id: wallet.id,
        email: wallet.email,
        address: wallet.walletAddress,
        walletId: wallet.walletId,
        type: wallet.walletType,
        createdAt: wallet.createdAt?.toISOString(),
      })),
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
          : "Failed to list unclaimed wallets",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}
