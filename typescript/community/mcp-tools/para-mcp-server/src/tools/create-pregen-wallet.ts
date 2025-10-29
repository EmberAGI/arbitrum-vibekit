import type { InferSchema } from "xmcp";
import { z } from "zod";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { getParaServerClient } from "@/lib/para-server-client";
import { WalletType } from "@getpara/server-sdk";
import { requestContext } from "@/app/mcp/route";

// Define the schema for tool parameters
export const schema = {
    email: z
        .string()
        .email()
        .describe("Email address for the pregenerated wallet"),
};

// Helper to check if client is OpenAI
function isOpenAIClient(): boolean {
    const context = requestContext.getStore();
    return context?.userAgent?.includes("openai-mcp") ?? false;
}

// Define tool metadata
export const metadata = {
    get name() {
        const isOpenAI = isOpenAIClient();
        return isOpenAI ? "create-pregen" : "create-pregen-wallet";
    },
    get description() {
        const isOpenAI = isOpenAIClient();
        if (isOpenAI) {
            return "Create a new pregenerated Para.";
        }
        return "Create a new pregenerated Para wallet for an email address. Only one wallet can be created per email. The wallet includes an EVM address, wallet ID, type, and encrypted user share that are securely stored in the database for later claiming.";
    },
    annotations: {
        get title() {
            const isOpenAI = isOpenAIClient();
            return isOpenAI ? "Create Pregenerated" : "Create Pregenerated Wallet";
        },
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
    },
};

// Tool implementation
export default async function createPregenWallet({
    email,
}: InferSchema<typeof schema>) {
    try {
        // Initialize Para server client
        const para = getParaServerClient();

        // Create pregenerated wallet
        const wallet = await para.createPregenWallet({
            type: WalletType.EVM,
            pregenIdentifier: email,
            pregenIdentifierType: "EMAIL",
        });

        // Get the user share
        const userShare = await para.getUserShare();

        if (!userShare) {
            throw new Error("Failed to retrieve user share from Para");
        }

        if (!wallet.address || !wallet.type) {
            throw new Error("Wallet creation incomplete - missing address or type");
        }

        // Store in database
        const insertValues = {
            email: email,
            walletId: wallet.id,
            walletAddress: wallet.address,
            walletType: wallet.type,
            userShare: userShare,
        };

        const [created] = await db
            .insert(pregenWallets)
            .values(insertValues)
            .returning();

        const result = {
            success: true,
            message: "Pregenerated wallet created successfully",
            wallet: {
                id: created.id,
                email: created.email,
                address: created.walletAddress,
                walletId: created.walletId,
                type: created.walletType,
                createdAt: created.createdAt?.toISOString(),
            },
        };

        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    } catch (error) {
        const result = {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create wallet",
        };

        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
}
