import { Para as ParaServer } from "@getpara/server-sdk";
import { db } from "../src/db/index.js";
import { pregenWallets } from "../src/db/schema.js";

async function createPregenWallet() {
  try {
    console.log("=== CREATING PREGEN WALLET ===\n");

    // Get email from command line argument or use default
    const email = process.argv[2] || "test@example.com";
    console.log(`Email: ${email}\n`);

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }

    // Get API key from environment
    const apiKey = process.env.PARA_API_KEY;
    if (!apiKey) {
      throw new Error("PARA_API_KEY not found in environment variables");
    }

    // Initialize Para Server SDK
    console.log("Initializing Para Server SDK...");
    const paraServer = new ParaServer(apiKey);

    // Check if wallet already exists
    console.log("Checking if wallet already exists...");
    const hasWallet = await paraServer.hasPregenWallet({
      pregenId: { email },
    });

    if (hasWallet) {
      console.log(`\n⚠️  Wallet already exists for ${email}`);
      console.log("Use a different email or check existing wallet in database\n");
      return;
    }

    // Create pregenerated wallet
    console.log("Creating pregenerated wallet...");
    const result = await paraServer.createPregenWallet({
      type: "EVM",
      pregenId: { email },
    });

    console.log("Wallet created, checking response structure...");
    console.log("Result type:", typeof result);
    console.log("Result keys:", result ? Object.keys(result) : "null");

    // Try to get userShare - it might be in the result or need to be fetched
    let userShare: string | null | undefined;
    let wallet: any = result;

    // Check if userShare is part of the result
    if (result && typeof result === 'object' && 'userShare' in result) {
      userShare = (result as any).userShare;
      console.log("Found userShare in wallet response");
    } else {
      // Try to get it via getUserShare()
      console.log("Attempting to get userShare via getUserShare()...");
      try {
        userShare = await paraServer.getUserShare();
        console.log("Got userShare from getUserShare()");
      } catch (error) {
        console.error("Error calling getUserShare():", error);
      }
    }

    if (!userShare) {
      throw new Error("Failed to retrieve user share from Para. Check if the API key has the correct permissions.");
    }

    if (!wallet.address || !wallet.type || !wallet.id) {
      throw new Error("Wallet creation incomplete - missing required properties");
    }

    // Store in database
    console.log("Saving wallet to database...");
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

    console.log("\n✅ SUCCESS! Pregenerated wallet created and saved to database:\n");
    console.log("Wallet Details:");
    console.log(`  Database ID: ${created.id}`);
    console.log(`  Email: ${created.email}`);
    console.log(`  Wallet ID: ${created.walletId}`);
    console.log(`  Wallet Address: ${created.walletAddress}`);
    console.log(`  Wallet Type: ${created.walletType}`);
    console.log(`  User Share Length: ${userShare.length} characters`);
    console.log(`  Created At: ${created.createdAt?.toISOString()}`);
    console.log(`  Claimed: ${created.claimedAt ? "Yes" : "No"}`);

    console.log("\n📝 Next Steps:");
    console.log(
      "  1. ✅ Wallet saved to database with encrypted userShare",
    );
    console.log(
      "  2. Fund the wallet address with ETH for gas and any tokens needed",
    );
    console.log("  3. Use the wallet for transactions via the Para SDK");
    console.log(
      "  4. User can claim the wallet later using the claim flow",
    );
    console.log(
      "\n⚠️  IMPORTANT: The userShare is stored securely in the database!",
    );
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
console.log("Usage: pnpm exec tsx --env-file=.env scripts/create-pregen-wallet.ts [email@example.com]\n");
createPregenWallet();
