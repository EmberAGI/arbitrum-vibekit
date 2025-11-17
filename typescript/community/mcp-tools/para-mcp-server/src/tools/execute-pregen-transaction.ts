import {
  createParaAccount,
  createParaViemClient,
} from "@getpara/viem-v2-integration";
import { eq } from "drizzle-orm";
import { createPublicClient, type Hex, http, defineChain } from "viem";
import type { InferSchema } from "xmcp";
import { z } from "zod";
import { requestContext } from "@/app/mcp/route";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { getParaServerClient } from "@/lib/para-server-client";

// Schema for the decoded transaction data
const transactionDataSchema = z.object({
  to: z.string().describe("Recipient address"),
  data: z.string().optional().describe("Transaction data (hex, optional)"),
  value: z.string().describe("Transaction value in wei"),
  chainId: z
    .string()
    .describe(
      "Chain ID as a string (for example, '42161' for Arbitrum, '8453' for Base)",
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

type RawTransaction = z.infer<typeof transactionDataSchema>;

function withSafeGasDefaults(rawTx: RawTransaction): RawTransaction {
  const tx: RawTransaction = { ...rawTx };

  if (!tx.gasLimit) {
    if (!tx.data || tx.data === "0x") {
      tx.gasLimit = "21000";
    } else {
      tx.gasLimit = "100000";
    }
  }

  let defaultGasPriceWei = "1000000000";

  if (tx.chainId === "84532") {
    // Base Sepolia - fast ≈ 0.16 gwei
    defaultGasPriceWei = "160000000";
  } else if (tx.chainId === "1500") {
    // Arbitrum Sepolia - fast ≈ 0.72 gwei
    defaultGasPriceWei = "720000000";
  } else if (tx.chainId === "8453") {
    // Base mainnet - fast ≈ 0.02 gwei
    defaultGasPriceWei = "20000000";
  } else if (tx.chainId === "42161") {
    // Arbitrum One mainnet - fast ≈ 0.05 gwei
    defaultGasPriceWei = "50000000";
  }

  if (!tx.maxFeePerGas) {
    tx.maxFeePerGas = defaultGasPriceWei;
  }

  if (!tx.maxPriorityFeePerGas) {
    tx.maxPriorityFeePerGas = defaultGasPriceWei;
  }

  return tx;
}

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
    .describe("RPC URL for the network"),
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
    return isOpenAI ? "pregen-tx" : "execute-pregen-transaction";
  },
  get description() {
    const isOpenAI = isOpenAIClient();
    if (isOpenAI) {
      return "pregen-tx";
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
    const rawTransaction = withSafeGasDefaults(rawTx);

 

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

    // Build a dynamic chain configuration from the provided chainId and rpcUrl
    const chainIdNumber = Number(rawTransaction.chainId);
    if (!Number.isInteger(chainIdNumber) || chainIdNumber <= 0) {
      throw new Error(
        `Invalid chain ID: ${rawTransaction.chainId}. Expected a positive integer string, e.g. "42161".`,
      );
    }

    const chainConfig = defineChain({
      id: chainIdNumber,
      name: `Chain ${rawTransaction.chainId}`,
      network: `chain-${rawTransaction.chainId}`,
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
      },
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
    });

    // Initialize Para server client
    const para = getParaServerClient();

    // Load the user share into Para client
    await para.setUserShare(walletRecord.userShare);

    // Create Para account and viem wallet client
    const account = createParaAccount(para);
    const walletClient = createParaViemClient(para, {
      account,
      chain: chainConfig,
      transport: http(rpcUrl),
    });

    // Create public client for reading blockchain data
    const publicClient = createPublicClient({
      chain: chainConfig,
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
        chainName: chainConfig.name,
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
