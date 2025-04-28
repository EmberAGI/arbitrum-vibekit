import EmberGrpcClient, {
  TransactionPlan,
  GetCapabilitiesResponse,
  Capability,
  CapabilityType,
  GetWalletPositionsResponse,
  WalletPosition,
  Token,
  GetTokensResponse,
  OrderType,
} from "@emberai/sdk-typescript";
// Use the high-level McpServer API
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export {
  GetCapabilitiesResponse,
  Capability,
  CapabilityType,
  GetWalletPositionsResponse,
  WalletPosition,
  TransactionPlan,
  GetTokensResponse,
  Token,
};

// --- Define Zod Schemas ---
// Convert our Zod objects to schema objects for MCP

const swapTokensSchema = {
  fromTokenAddress: z
    .string()
    .describe("The contract address of the token to swap from."),
  fromTokenChainId: z
    .string()
    .describe("The chain ID where the fromToken contract resides."),
  toTokenAddress: z
    .string()
    .describe("The contract address of the token to swap to."),
  toTokenChainId: z
    .string()
    .describe("The chain ID where the toToken contract resides."),
  amount: z
    .string()
    .describe(
      "The amount of the fromToken to swap (atomic, non-human readable format)."
    ),
  userAddress: z.string().describe("The wallet address initiating the swap."),
};

const borrowSchema = {
  tokenAddress: z
    .string()
    .describe("The contract address of the token to borrow."),
  tokenChainId: z
    .string()
    .describe("The chain ID where the token contract resides."),
  amount: z
    .string()
    .describe("The amount to borrow (human readable format expected by SDK)."),
  userAddress: z.string().describe("The wallet address initiating the borrow."),
};

const repaySchema = {
  tokenAddress: z
    .string()
    .describe("The contract address of the token to repay."),
  tokenChainId: z
    .string()
    .describe("The chain ID where the token contract resides."),
  amount: z.string().describe("The amount to repay (-human readable format)."),
  userAddress: z
    .string()
    .describe("The wallet address initiating the repayment."),
};

const supplySchema = {
  tokenAddress: z
    .string()
    .describe("The contract address of the token to supply."),
  tokenChainId: z
    .string()
    .describe("The chain ID where the token contract resides."),
  amount: z.string().describe("The amount to supply (human readable format)."),
  userAddress: z.string().describe("The supplier's wallet address."),
};

const withdrawSchema = {
  tokenAddress: z
    .string()
    .describe("The contract address of the token to withdraw."),
  tokenChainId: z
    .string()
    .describe("The chain ID where the token contract resides."),
  amount: z
    .string()
    .describe("The amount to withdraw (human readable format)."),
  userAddress: z.string().describe("The lender's wallet address."),
};

const getCapabilitiesSchema = {
  type: z
    .nativeEnum(CapabilityType)
    .describe("The type of capabilities to get."),
};

const getUserPositionsSchema = {
  userAddress: z
    .string()
    .describe("The wallet address to fetch positions for."),
};

const getTokensSchema = {
  chainId: z.string().describe("The chain ID to get tokens for.").optional(),
  filter: z.string().describe("A filter to apply to the tokens.").optional(),
};

// Define types from schemas using z.object() on the raw schema definitions
const swapTokensParamsValidator = z.object(swapTokensSchema);
const borrowParamsValidator = z.object(borrowSchema);
const repayParamsValidator = z.object(repaySchema);
const supplyParamsValidator = z.object(supplySchema);
const withdrawParamsValidator = z.object(withdrawSchema);
const getCapabilitiesParamsValidator = z.object(getCapabilitiesSchema);
const getUserPositionsParamsValidator = z.object(getUserPositionsSchema);
const getTokensParamsValidator = z.object(getTokensSchema);

type SwapTokensParams = z.infer<typeof swapTokensParamsValidator>;
type BorrowParams = z.infer<typeof borrowParamsValidator>;
type RepayParams = z.infer<typeof repayParamsValidator>;
type SupplyParams = z.infer<typeof supplyParamsValidator>;
type WithdrawParams = z.infer<typeof withdrawParamsValidator>;
type GetCapabilitiesParams = z.infer<typeof getCapabilitiesParamsValidator>;
type GetUserPositionsParams = z.infer<typeof getUserPositionsParamsValidator>;
type GetTokensParams = z.infer<typeof getTokensParamsValidator>;

// Create Zod objects for inference - REMOVED as we use raw schemas now
// const swapTokensParams = z.object(swapTokensSchema);
// const borrowParams = z.object(borrowSchema);
// const repayParams = z.object(repaySchema);
// const supplyParams = z.object(supplySchema);
// const withdrawParams = z.object(withdrawSchema);
// const getCapabilitiesParams = z.object(getCapabilitiesSchema);
// const getUserPositionsParams = z.object(getUserPositionsSchema);
// const getTokensParams = z.object(getTokensSchema);
// --- Tool Definitions for tools/list ---
// Helper to convert Zod schema to MCP argument definition
const zodSchemaToMcpArgs = (schema: Record<string, z.ZodTypeAny>) => {
  return Object.entries(schema).map(([name, zodType]) => ({
    name,
    description: zodType.description || "",
    required: !zodType.isOptional(),
    // We might need a mapping from Zod types to JSON schema types here
    // For now, just using 'any' - refine if needed
    typeSchema: { type: "any" },
  }));
};

const toolDefinitions = [
  {
    name: "swapTokens",
    description: "Swap or convert tokens using Ember On-chain Actions",
    arguments: zodSchemaToMcpArgs(swapTokensSchema),
  },
  {
    name: "borrow",
    description: "Borrow tokens using Ember On-chain Actions",
    arguments: zodSchemaToMcpArgs(borrowSchema),
  },
  {
    name: "repay",
    description: "Repay borrowed tokens using Ember On-chain Actions",
    arguments: zodSchemaToMcpArgs(repaySchema),
  },
  {
    name: "supply",
    description: "Supply tokens using Ember On-chain Actions",
    arguments: zodSchemaToMcpArgs(supplySchema),
  },
  {
    name: "withdraw",
    description: "Withdraw tokens using Ember On-chain Actions",
    arguments: zodSchemaToMcpArgs(withdrawSchema),
  },
  {
    name: "getCapabilities",
    description: "Get Ember On-chain Actions capabilities",
    arguments: zodSchemaToMcpArgs(getCapabilitiesSchema),
  },
  {
    name: "getUserPositions",
    description: "Get user wallet positions using Ember On-chain Actions",
    arguments: zodSchemaToMcpArgs(getUserPositionsSchema),
  },
  {
    name: "getTokens",
    description: "Get a list of supported tokens using Ember On-chain Actions",
    arguments: zodSchemaToMcpArgs(getTokensSchema),
  },
];

// --- Initialize the MCP server using the high-level McpServer API
const server = new McpServer({
  name: "ember-mcp-tool-server",
  version: "1.0.0",
});

// Read endpoint from environment variable or use default
const defaultEndpoint = "grpc.api.emberai.xyz:50051";
const emberEndpoint = process.env.EMBER_ENDPOINT || defaultEndpoint;

if (emberEndpoint === defaultEndpoint) {
  console.error(
    `Using default Ember endpoint: ${defaultEndpoint}. Set EMBER_ENDPOINT env var to override.`
  );
} else {
  console.error(
    `Using Ember endpoint from EMBER_ENDPOINT env var: ${emberEndpoint}`
  );
}

const emberClient = new EmberGrpcClient(emberEndpoint);

// --- Register Tools ---
// Pass the raw schema (e.g., swapTokensSchema) instead of the validator instance
server.tool(
  "swapTokens",
  "Swap or convert tokens using Ember On-chain Actions",
  swapTokensSchema,
  async (params: SwapTokensParams, extra: any) => {
    console.error(`Executing swapTokens tool with params:`, params);
    console.error(`Extra object for swapTokens:`, extra);

    try {
      const fromToken = {
        chainId: params.fromTokenChainId,
        address: params.fromTokenAddress,
      };
      const toToken = {
        chainId: params.toTokenChainId,
        address: params.toTokenAddress,
      };
      const response = await emberClient.swapTokens({
        orderType: OrderType.MARKET_SELL,
        baseToken: fromToken,
        quoteToken: toToken,
        amount: params.amount,
        recipient: params.userAddress,
      });

      if (response.error || !response.transactions) {
        throw new Error(
          response.error?.message || "No transaction plan returned for swap"
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      console.error(`SwapTokens tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);
server.tool(
  "borrow",
  "Borrow tokens using Ember On-chain Actions",
  borrowSchema,
  async (params: BorrowParams, extra: any) => {
    console.error(`Executing borrow tool with params:`, params);
    console.error(`Extra object for borrow:`, extra);

    try {
      const response = await emberClient.borrowTokens({
        tokenUid: {
          chainId: params.tokenChainId,
          address: params.tokenAddress,
        },
        amount: params.amount,
        borrowerWalletAddress: params.userAddress,
      });

      if (response.error || !response.transactions) {
        throw new Error(
          response.error?.message || "No transaction plan returned for borrow"
        );
      }

      console.error(
        `Borrow tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.transactions),
          },
        ],
      };
    } catch (error) {
      console.error(`Borrow tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "repay",
  "Repay borrowed tokens using Ember On-chain Actions",
  repaySchema,
  async (params: RepayParams, extra: any) => {
    console.error(`Executing repay tool with params:`, params);
    console.error(`Extra object for repay:`, extra);

    try {
      const response = await emberClient.repayTokens({
        tokenUid: {
          chainId: params.tokenChainId,
          address: params.tokenAddress,
        },
        amount: params.amount,
        borrowerWalletAddress: params.userAddress,
      });

      if (response.error || !response.transactions) {
        throw new Error(
          response.error?.message || "No transaction plan returned for repay"
        );
      }

      console.error(`Repay tool success. Transactions:`, response.transactions);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.transactions),
          },
        ],
      };
    } catch (error) {
      console.error(`Repay tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "supply",
  "Supply tokens using Ember On-chain Actions",
  supplySchema,
  async (params: SupplyParams, extra: any) => {
    console.error(`Executing supply tool with params:`, params);
    console.error(`Extra object for supply:`, extra);

    try {
      const response = await emberClient.supplyTokens({
        tokenUid: {
          chainId: params.tokenChainId,
          address: params.tokenAddress,
        },
        amount: params.amount,
        supplierWalletAddress: params.userAddress,
      });

      if (response.error || !response.transactions) {
        throw new Error(
          response.error?.message || "No transaction plan returned for supply"
        );
      }

      console.error(
        `Supply tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.transactions),
          },
        ],
      };
    } catch (error) {
      console.error(`Supply tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "withdraw",
  "Withdraw tokens using Ember On-chain Actions",
  withdrawSchema,
  async (params: WithdrawParams, extra: any) => {
    console.error(`Executing withdraw tool with params:`, params);
    console.error(`Extra object for withdraw:`, extra);

    try {
      const response = await emberClient.withdrawTokens({
        tokenUid: {
          chainId: params.tokenChainId,
          address: params.tokenAddress,
        },
        amount: params.amount,
        lenderWalletAddress: params.userAddress,
      });

      if (response.error || !response.transactions) {
        throw new Error(
          response.error?.message || "No transaction plan returned for withdraw"
        );
      }

      console.error(
        `Withdraw tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.transactions),
          },
        ],
      };
    } catch (error) {
      console.error(`Withdraw tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "getCapabilities",
  "Get Ember On-chain Actions capabilities",
  getCapabilitiesSchema,
  async (params: GetCapabilitiesParams, extra: any) => {
    console.error(`Executing getCapabilities tool with params:`, params);
    console.error(`Extra object for getCapabilities:`, extra);

    try {
      const response = await emberClient.getCapabilities({ type: params.type });

      console.error(`GetCapabilities tool success.`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      console.error(`GetCapabilities tool error:`, error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${(error as Error).message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getUserPositions",
  "Get user wallet positions using Ember On-chain Actions",
  getUserPositionsSchema,
  async (params: GetUserPositionsParams, extra: any) => {
    console.error(`Executing getUserPositions tool with params:`, params);
    console.error(`Extra object for getUserPositions:`, extra);

    try {
      const response = await emberClient.getWalletPositions({
        walletAddress: params.userAddress,
      });

      console.error(`GetUserPositions tool success.`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      console.error(`GetUserPositions tool error:`, error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${(error as Error).message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getTokens",
  "Get a list of supported tokens using Ember On-chain Actions",
  getTokensSchema,
  async (params: GetTokensParams, extra: any) => {
    console.error(`Executing getTokens tool with params:`, params);
    console.error(`Extra object for getTokens:`, extra);

    try {
      const response = await emberClient.getTokens({
        chainId: params.chainId ?? "",
        filter: params.filter ?? "",
      });
      console.error(`GetTokens tool success.`);
      return { content: [{ type: "text", text: JSON.stringify(response) }] };
    } catch (error) {
      console.error(`GetTokens tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

// --- Connect Transport and Start Server ---
async function main() {
  // Use Stdio transport for communication
  const transport = new StdioServerTransport();

  try {
    // Add log message to monitor transport communication
    console.error("Initializing transport...");

    // Connect the server to the transport
    await server.connect(transport);
    console.error("Ember MCP stdio server started and connected.");

    // Special logging to help transport debugging
    console.error("Server is now ready to receive requests.");
  } catch (error) {
    console.error("Failed to start or connect the MCP server:", error);
    process.exit(1);
  }
}

// Run the server
main();
