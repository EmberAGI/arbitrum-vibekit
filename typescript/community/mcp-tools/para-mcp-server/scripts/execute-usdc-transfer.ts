import {
  createParaAccount,
  createParaViemClient,
} from "@getpara/viem-v2-integration";
import { eq } from "drizzle-orm";
import {
  type Chain,
  createPublicClient,
  type Hex,
  http,
  isAddress,
} from "viem";
import { arbitrumSepolia, baseSepolia } from "viem/chains";
import { db } from "../src/db/index.js";
import { pregenWallets } from "../src/db/schema.js";
import { getParaServerClient } from "../src/lib/para-server-client.js";

// Supported networks mapping
const SUPPORTED_NETWORKS: Record<string, { chain: Chain; name: string }> = {
  "421614": { chain: arbitrumSepolia, name: "Arbitrum Sepolia" },
  "84532": { chain: baseSepolia, name: "Base Sepolia" },
};

// USDC contract addresses
const USDC_ADDRESSES = {
  "421614": "0x75faf114eafb1acbe221eeb436a3b55a6e778d8b", // Arbitrum Sepolia USDC
  "84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
};

const USDC_DECIMALS = 6;

async function executeUsdcTransfer() {
  try {
    console.log("=== EXECUTING USDC TRANSFER WITH PREGEN WALLET ===\n");

    // Get parameters from command line arguments
    const email = process.argv[2];
    const recipient = process.argv[3];
    const amount = process.argv[4];
    const chainId = process.argv[5] || "84532"; // Default to Base Sepolia

    if (!email || !recipient || !amount) {
      console.error(
        "Usage: pnpm exec tsx --env-file=.env scripts/execute-usdc-transfer.ts <email> <recipient> <amount> [chainId]",
      );
      console.error(
        "Example: pnpm exec tsx --env-file=.env scripts/execute-usdc-transfer.ts test@example.com 0x1234...abcd 1.5 84532",
      );
      process.exit(1);
    }

    console.log(`Email: ${email}`);
    console.log(`Recipient: ${recipient}`);
    console.log(`Amount: ${amount} USDC`);
    console.log(
      `Chain ID: ${chainId} (${SUPPORTED_NETWORKS[chainId]?.name || "Unknown"})\n`,
    );

    // Validate recipient address
    if (!isAddress(recipient)) {
      throw new Error("Invalid recipient address format");
    }

    // Validate amount
    const amountFloat = parseFloat(amount);
    if (Number.isNaN(amountFloat) || amountFloat <= 0) {
      throw new Error("Invalid amount. Must be a positive number.");
    }

    // Get chain configuration
    const networkConfig = SUPPORTED_NETWORKS[chainId];
    if (!networkConfig) {
      throw new Error(
        `Unsupported chain ID: ${chainId}. Supported: ${Object.keys(SUPPORTED_NETWORKS).join(", ")}`,
      );
    }

    // Query database for the pregen wallet
    console.log("Looking up pregen wallet in database...");
    const walletRecord = await db.query.pregenWallets.findFirst({
      where: eq(pregenWallets.email, email),
    });

    if (!walletRecord) {
      throw new Error(`No pregenerated wallet found for email: ${email}`);
    }

    if (!walletRecord.userShare) {
      throw new Error(
        `User share not found for wallet: ${walletRecord.walletId}`,
      );
    }

    console.log(
      `Found wallet: ${walletRecord.walletAddress} (ID: ${walletRecord.walletId})`,
    );

    // Initialize Para server client
    const para = getParaServerClient();

    // Load the user share into Para client
    console.log("Loading user share into Para client...");
    await para.setUserShare(walletRecord.userShare);

    // Create Para account and viem wallet client
    console.log("Creating Para account and wallet client...");
    const account = createParaAccount(para);
    const walletClient = createParaViemClient(para, {
      account,
      chain: networkConfig.chain,
      transport: http(),
    });

    // Create public client for reading blockchain data
    const publicClient = createPublicClient({
      chain: networkConfig.chain,
      transport: http(),
    });

    // Get USDC contract address for the selected chain
    const usdcAddress = USDC_ADDRESSES[chainId as keyof typeof USDC_ADDRESSES];
    if (!usdcAddress) {
      throw new Error(`USDC not supported on chain ${chainId}`);
    }

    // Convert amount to atomic units (USDC has 6 decimals)
    const atomicAmount = BigInt(Math.floor(amountFloat * 10 ** USDC_DECIMALS));

    console.log(
      `Preparing USDC transfer: ${amountFloat} USDC (${atomicAmount.toString()} atomic units)`,
    );
    console.log(`From: ${walletRecord.walletAddress}`);
    console.log(`To: ${recipient}`);
    console.log(`USDC Contract: ${usdcAddress}`);

    // USDC transfer function signature: transfer(address to, uint256 amount)
    const transferFunctionSignature = "0xa9059cbb";
    const recipientPadded = recipient.toLowerCase().slice(2).padStart(64, "0");
    const amountPadded = atomicAmount.toString(16).padStart(64, "0");
    const transferData = (transferFunctionSignature +
      recipientPadded +
      amountPadded) as Hex;

    // Prepare transaction parameters
    const txParams = {
      to: usdcAddress as Hex,
      value: 0n, // No ETH for token transfer
      data: transferData,
    };

    console.log("\nSending transaction...");
    console.log(`Transaction data: ${transferData}`);

    // Send transaction and get hash
    const txHash = await walletClient.sendTransaction(txParams);
    console.log(`Transaction sent: ${txHash}`);

    // Wait for transaction receipt
    console.log("Waiting for transaction confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    console.log("\n✅ SUCCESS! Transaction executed and confirmed:\n");
    console.log("Transaction Details:");
    console.log(`  Wallet ID: ${walletRecord.walletId}`);
    console.log(`  Wallet Address: ${walletRecord.walletAddress}`);
    console.log(`  Transaction Hash: ${receipt.transactionHash}`);
    console.log(`  Block Number: ${receipt.blockNumber}`);
    console.log(`  Block Hash: ${receipt.blockHash}`);
    console.log(`  Gas Used: ${receipt.gasUsed.toString()}`);
    console.log(
      `  Effective Gas Price: ${receipt.effectiveGasPrice?.toString() || "N/A"}`,
    );
    console.log(
      `  Status: ${receipt.status === "success" ? "Success" : "Failed"}`,
    );
    console.log(`  Chain: ${networkConfig.name} (${chainId})`);
    console.log(`  USDC Transferred: ${amountFloat} to ${recipient}`);

    if (receipt.status !== "success") {
      console.warn("\n⚠️  WARNING: Transaction failed on chain!");
      process.exit(1);
    }

    console.log("\n📝 Transaction completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR:");
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
      if (error.stack) {
        console.error("\nStack trace:");
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Run the script
// Note: Must run with --env-file flag to load environment variables
executeUsdcTransfer();
