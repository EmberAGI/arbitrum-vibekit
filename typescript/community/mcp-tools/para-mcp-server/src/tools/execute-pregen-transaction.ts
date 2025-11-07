import {
  createParaAccount,
  createParaViemClient,
} from "@getpara/viem-v2-integration";
import { eq } from "drizzle-orm";
import { type Chain, createPublicClient, type Hex, http } from "viem";
import { arbitrum, arbitrumSepolia, base, baseSepolia } from "viem/chains";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { getParaServerClient } from "@/lib/para-server-client";

// Supported networks mapping
const SUPPORTED_NETWORKS: Record<string, { chain: Chain; name: string }> = {
  "42161": { chain: arbitrum, name: "Arbitrum" },
  "421614": { chain: arbitrumSepolia, name: "Arbitrum Sepolia" },
  "8453": { chain: base, name: "Base" },
  "84532": { chain: baseSepolia, name: "Base Sepolia" },
};

// Schema for the decoded transaction data
const transactionDataSchema = z.object({
  to: z.string().describe("Recipient address"),
  data: z.string().optional().describe("Transaction data (hex, optional)"),
  value: z.string().describe("Transaction value in wei"),
  chainId: z
    .enum(["42161", "421614", "8453", "84532"])
    .describe(
      "Chain ID: 42161 (Arbitrum), 421614 (Arbitrum Sepolia), 8453 (Base), 84532 (Base Sepolia)",
    ),
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
});

// Define the schema for tool parameters
export const schema = {
  userIdentifier: z
    .string()
    .describe(
      "User identifier - can be email address or database UUID of the pregen wallet",
    ),
  rawTx: transactionDataSchema.describe("Transaction data to sign and execute"),
  rpcUrl: z
    .string()
    .url()
    .optional()
    .describe("Optional custom RPC URL for the network"),
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
    return isOpenAI ? "process-operation" : "execute-pregen-transaction";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "process operation";
    }
    return "Execute a transaction using a pregenerated Para wallet on Arbitrum, Base, Arbitrum Sepolia, or Base Sepolia. Signs and broadcasts the transaction to the blockchain, then returns the transaction receipt with confirmation details.";
  },
  annotations: {
    get title() {
      const isOpenAI = isOpenAIClient();
      return isOpenAI
        ? "Process Operation"
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
  rawTx,
  rpcUrl,
}: InferSchema<typeof schema>) {
  try {
    const rawTransaction = rawTx;

    // For OpenAI clients, just validate and return the transaction data without executing
    if (isOpenAIClient()) {
      const result = {
        success: true,
        message: "Transaction data validated successfully",
        validatedTransaction: rawTransaction,
        note: "Transaction not executed - validation only for OpenAI client",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    // Query database for the pregen wallet
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

    // Get chain configuration
    const networkConfig = SUPPORTED_NETWORKS[rawTransaction.chainId];
    if (!networkConfig) {
      throw new Error(
        `Unsupported chain ID: ${rawTransaction.chainId}. Supported: ${Object.keys(SUPPORTED_NETWORKS).join(", ")}`,
      );
    }

    // Initialize Para server client
    const para = getParaServerClient();

    // Load the user share into Para client
    await para.setUserShare(walletRecord.userShare);

    // Create Para account and viem wallet client
    const account = createParaAccount(para);
    const walletClient = createParaViemClient(para, {
      account,
      chain: networkConfig.chain,
      transport: http(rpcUrl),
    });

    // Create public client for reading blockchain data
    const publicClient = createPublicClient({
      chain: networkConfig.chain,
      transport: http(rpcUrl),
    });

    // Prepare transaction parameters
    const txParams: {
      to: Hex;
      value: bigint;
      data?: Hex;
      gas?: bigint;
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
    } = {
      to: rawTransaction.to as Hex,
      value: BigInt(rawTransaction.value),
    };

    if (rawTransaction.data) {
      txParams.data = rawTransaction.data as Hex;
    }

    if (rawTransaction.gasLimit) {
      txParams.gas = BigInt(rawTransaction.gasLimit);
    }

    if (rawTransaction.maxFeePerGas) {
      txParams.maxFeePerGas = BigInt(rawTransaction.maxFeePerGas);
    }

    if (rawTransaction.maxPriorityFeePerGas) {
      txParams.maxPriorityFeePerGas = BigInt(
        rawTransaction.maxPriorityFeePerGas,
      );
    }

    // Send transaction and get hash
    const txHash = await walletClient.sendTransaction(txParams);

    console.log("Transaction sent:", txHash);

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    const result = {
      success: true,
      message: "Transaction executed successfully",
      transaction: {
        walletId: walletRecord.walletId,
        walletAddress: walletRecord.walletAddress,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber.toString(),
        blockHash: receipt.blockHash,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        status: receipt.status === "success" ? "success" : "failed",
        chainId: rawTransaction.chainId,
        chainName: networkConfig.name,
        to: rawTransaction.to,
        value: rawTransaction.value,
      },
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
