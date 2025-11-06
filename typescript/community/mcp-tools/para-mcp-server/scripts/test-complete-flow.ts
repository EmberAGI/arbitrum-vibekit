import { experimental_createMCPClient } from "@ai-sdk/mcp";
import type { Address, Hex } from "viem";

async function testCompleteFlow() {
  let client;
  try {
    console.log("=== TESTING COMPLETE CREATE MOCK TRANSACTION FLOW ===\n");
    
    console.log("Creating MCP client...");
    client = await experimental_createMCPClient({
      transport: {
        type: "http",
        url: "https://api.emberai.xyz/mcp",
      },
    });

    console.log("Getting tools...");
    const tools = await client.tools();

    const createSwapTool = tools.createSwap;
    if (!createSwapTool) {
      throw new Error("createSwap tool not found in Ember MCP");
    }

    const input = {
      amount: "1",
      amountType: "exactIn" as const,
      fromChain: "arbitrum",
      fromToken: "ETH",
      toChain: "arbitrum",
      toToken: "USDC",
      walletAddress: "0x7B4C48aa84eDB406f18eF1a1B1021B0E78aB4b25",
      slippageTolerance: "0.5",
    };

    console.log("\nInput parameters:");
    console.log(JSON.stringify(input, null, 2));

    console.log("\nExecuting createSwap...");
    const swapResult = await createSwapTool.execute(input, {
      toolCallId: "swap-call-1",
      messages: [],
    });

    console.log("\n=== PROCESSING RESULT (FIXED LOGIC) ===");
    
    // Extract structured content from the swap result (FIXED)
    const swapData = swapResult as {
      structuredContent?: unknown;
    };

    if (!swapData.structuredContent) {
      throw new Error("No structuredContent in swap result");
    }

    const structuredContent = swapData.structuredContent as {
      fromToken: {
        tokenUid: { address: string; chainId: string };
        symbol: string;
      };
      toToken: {
        tokenUid: { address: string; chainId: string };
        symbol: string;
      };
      displayFromAmount: string;
      displayToAmount: string;
      transactions: Array<{
        to: string;
        data: string;
        value: string;
        chainId: string;
      }>;
    };

    // Extract transactions from Ember response
    const transactions = structuredContent.transactions;
    if (!transactions || !Array.isArray(transactions)) {
      throw new Error("No transactions in structuredContent");
    }

    console.log(`Found ${transactions.length} transaction(s)`);

    // Convert Ember's transactions to txPlan format
    const txPlan = transactions.map(
      (tx: { to: string; data: string; value: string; chainId: string }) => ({
        to: tx.to as Address,
        data: tx.data as Hex,
        value: tx.value,
        chainId: tx.chainId,
      }),
    );

    // Build txPreview from structured content
    const txPreview = {
      fromTokenAmount: structuredContent.displayFromAmount,
      fromTokenSymbol: structuredContent.fromToken.symbol,
      fromTokenAddress: structuredContent.fromToken.tokenUid.address,
      fromChain: input.fromChain,
      toTokenAmount: structuredContent.displayToAmount,
      toTokenSymbol: structuredContent.toToken.symbol,
      toTokenAddress: structuredContent.toToken.tokenUid.address,
      toChain: input.toChain,
    };

    const result = {
      artifacts: [
        {
          name: "transaction-preview",
          parts: [
            {
              data: {
                txPreview,
                txPlan,
              },
            },
          ],
        },
      ],
    };

    console.log("\n=== FINAL RESULT ===");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n=== SUCCESS! ===");
    console.log("Transaction preview:");
    console.log(`  Swap ${txPreview.fromTokenAmount} ${txPreview.fromTokenSymbol} → ${txPreview.toTokenAmount} ${txPreview.toTokenSymbol}`);
    console.log(`  Chain: ${txPreview.fromChain}`);
    console.log(`\nTransaction plan:`);
    txPlan.forEach((tx, idx) => {
      console.log(`  TX ${idx + 1}:`);
      console.log(`    To: ${tx.to}`);
      console.log(`    Value: ${tx.value} wei`);
      console.log(`    Data length: ${tx.data.length} bytes`);
      console.log(`    Chain ID: ${tx.chainId}`);
    });

  } catch (error) {
    console.error("\n=== ERROR ===");
    console.error(error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      console.log("\nClosing MCP client...");
      await client.close();
    }
  }
}

testCompleteFlow();
