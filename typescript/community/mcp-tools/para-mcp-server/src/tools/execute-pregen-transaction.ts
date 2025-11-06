import { eq } from "drizzle-orm";
import { type Hex, keccak256, serializeTransaction } from "viem";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { getParaServerClient } from "@/lib/para-server-client";

// Define the schema for tool parameters
export const schema = {
  userIdentifier: z
    .string()
    .describe(
      "User identifier - can be email address or database UUID of the pregen wallet",
    ),
  rawTransaction: z
    .object({
      to: z.string().describe("Recipient address"),
      data: z.string().describe("Transaction data (hex)"),
      value: z.string().describe("Transaction value in wei"),
      chainId: z.string().describe("Chain ID for the transaction"),
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
    })
    .describe("Raw transaction data to sign and execute"),
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
    return isOpenAI ? "execute-pregen-tx" : "execute-pregen-transaction";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "Sign and execute a transaction using a pregenerated Para wallet.";
    }
    return "Sign and execute a transaction using a pregenerated Para wallet. Retrieves the user share from the database, loads it into the Para client, signs the raw transaction data, and returns the signed transaction ready for broadcasting to the blockchain.";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI
        ? "Execute Pregen Transaction"
        : "Execute Pregenerated Wallet Transaction";
    },
    readOnlyHint: false,
    destructiveHint: true, // Signing transactions is a destructive operation
    idempotentHint: false,
  },
};

// Tool implementation
export default async function executePregenTransaction({
  userIdentifier,
  rawTransaction,
}: InferSchema<typeof schema>) {
  try {
    // Query database for the pregen wallet
    // Check if userIdentifier is a UUID or email
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userIdentifier,
      );

    const walletRecord = await db.query.pregenWallets.findFirst({
      where: isUUID
        ? eq(pregenWallets.id, userIdentifier)
        : eq(pregenWallets.email, userIdentifier),
    });

    if (!walletRecord) {
      throw new Error(
        `No pregenerated wallet found for identifier: ${userIdentifier}`,
      );
    }

    if (!walletRecord.userShare) {
      throw new Error(
        `User share not found for wallet: ${walletRecord.walletId}`,
      );
    }

    // Initialize Para server client
    const para = getParaServerClient();

    // Load the user share into Para client
    await para.setUserShare(walletRecord.userShare);

    // Prepare the transaction for signing using viem types
    const txParams = {
      to: rawTransaction.to as Hex,
      data: rawTransaction.data as Hex,
      value: BigInt(rawTransaction.value),
      chainId: Number.parseInt(rawTransaction.chainId, 10),
      gas: rawTransaction.gasLimit
        ? BigInt(rawTransaction.gasLimit)
        : BigInt(100000),
      maxFeePerGas: rawTransaction.maxFeePerGas
        ? BigInt(rawTransaction.maxFeePerGas)
        : undefined,
      maxPriorityFeePerGas: rawTransaction.maxPriorityFeePerGas
        ? BigInt(rawTransaction.maxPriorityFeePerGas)
        : undefined,
      type: "eip1559" as const,
    };

    // Serialize the unsigned transaction to get RLP-encoded bytes
    const rlpEncodedTx = serializeTransaction(txParams);

    // Convert to base64 for Para SDK (remove 0x prefix first)
    const rlpEncodedTxBase64 = Buffer.from(
      rlpEncodedTx.slice(2),
      "hex",
    ).toString("base64");

    // Sign the transaction using Para
    const signatureResult = await para.signTransaction({
      walletId: walletRecord.walletId,
      rlpEncodedTxBase64,
      chainId: rawTransaction.chainId,
    });

    // Check if signing was successful
    // Based on Para docs, SuccessfulSignatureRes has 'signature' property for signed transactions
    const isSuccessful = signatureResult && "signature" in signatureResult;
    if (!isSuccessful || !signatureResult.signature) {
      throw new Error("Failed to sign transaction - no signature returned");
    }

    // The signature property contains the signed transaction for EVM
    const signedTx = signatureResult.signature as Hex;
    const txHash = keccak256(signedTx);

    const result = {
      success: true,
      message: "Transaction signed successfully",
      transaction: {
        walletId: walletRecord.walletId,
        walletAddress: walletRecord.walletAddress,
        signedTransaction: signedTx,
        transactionHash: txHash,
        chainId: rawTransaction.chainId,
        to: rawTransaction.to,
        value: rawTransaction.value,
      },
      instructions:
        "The transaction has been signed. You can broadcast it to the blockchain using an RPC provider with eth_sendRawTransaction method.",
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
          : "Failed to execute pregen transaction",
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
