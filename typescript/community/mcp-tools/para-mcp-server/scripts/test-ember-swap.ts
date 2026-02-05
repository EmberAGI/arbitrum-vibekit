import { experimental_createMCPClient } from "@ai-sdk/mcp";

async function testEmberSwap() {
  let client;
  try {
    console.log("Creating MCP client...");
    client = await experimental_createMCPClient({
      transport: {
        type: "http",
        url: "https://api.emberai.xyz/mcp",
      },
    });

    console.log("Getting tools...");
    const tools = await client.tools();
    console.log("Available tools:", Object.keys(tools));

    const createSwapTool = tools.createSwap;
    if (!createSwapTool) {
      throw new Error("createSwap tool not found in Ember MCP");
    }

    console.log("\nCalling createSwap with input:");
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
    console.log(JSON.stringify(input, null, 2));

    console.log("\nExecuting createSwap...");
    const swapResult = await createSwapTool.execute(input, {
      toolCallId: "swap-call-1",
      messages: [],
    });

    console.log("\n=== RAW SWAP RESULT ===");
    console.log(JSON.stringify(swapResult, null, 2));

    console.log("\n=== ANALYZING RESULT STRUCTURE ===");
    console.log("Type of result:", typeof swapResult);
    console.log("Is array:", Array.isArray(swapResult));
    console.log("Keys:", Object.keys(swapResult as object));

    // Try to extract content
    const swapData = swapResult as {
      content?: Array<{ type: string; text?: string }>;
    };
    console.log("\nContent exists:", !!swapData.content);
    console.log("Content length:", swapData.content?.length);

    if (swapData.content) {
      console.log("\n=== CONTENT ITEMS ===");
      swapData.content.forEach((item, idx) => {
        console.log(`\nItem ${idx}:`);
        console.log("  Type:", item.type);
        console.log("  Has text:", !!item.text);
        if (item.text) {
          console.log("  Text preview:", item.text.substring(0, 200));
        }
      });

      const textContent = swapData.content.find((c) => c.type === "text");
      if (textContent?.text) {
        console.log("\n=== PARSED TEXT CONTENT ===");
        const parsedResult = JSON.parse(textContent.text);
        console.log(JSON.stringify(parsedResult, null, 2));
      }
    }
  } catch (error) {
    console.error("\n=== ERROR ===");
    console.error(error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
  } finally {
    if (client) {
      console.log("\nClosing MCP client...");
      await client.close();
    }
  }
}

testEmberSwap();
