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
  TokenIdentifier,
  GetLiquidityPoolsResponse,
  GetUserLiquidityPositionsResponse,
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

const supplyLiquiditySchema = {
  token0Address: z
    .string()
    .describe("The contract address of the first token in the pair (token0)."),
  token0ChainId: z
    .string()
    .describe("The chain ID where the token0 contract resides."),
  token1Address: z
    .string()
    .describe("The contract address of the second token in the pair (token1)."),
  token1ChainId: z
    .string()
    .describe("The chain ID where the token1 contract resides."),
  amount0: z
    .string()
    .describe("The amount of token0 to supply (human-readable format)."),
  amount1: z
    .string()
    .describe("The amount of token1 to supply (human-readable format)."),
  priceFrom: z
    .string()
    .describe(
      "The lower bound price for the liquidity range (human-readable format)."
    ),
  priceTo: z
    .string()
    .describe(
      "The upper bound price for the liquidity range (human-readable format)."
    ),
  userAddress: z
    .string()
    .describe("The wallet address supplying the liquidity."),
};

const withdrawLiquiditySchema = {
  tokenId: z
    .string()
    .describe(
      "The NFT token ID representing the liquidity position to withdraw."
    ),
  providerId: z
    .string()
    .describe(
      "The ID of the liquidity provider protocol (e.g., 'uniswap_v3'). Usually obtained from the getUserLiquidityPositions tool."
    ),
  userAddress: z
    .string()
    .describe("The wallet address withdrawing the liquidity."),
};

const getLiquidityPoolsSchema = {
  // No parameters currently needed, but could add filters later (e.g., chainId)
};

const getUserLiquidityPositionsSchema = {
  userAddress: z
    .string()
    .describe("The wallet address to fetch liquidity positions for."),
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
const supplyLiquidityParamsValidator = z.object(supplyLiquiditySchema);
const withdrawLiquidityParamsValidator = z.object(withdrawLiquiditySchema);
const getLiquidityPoolsParamsValidator = z.object(getLiquidityPoolsSchema);
const getUserLiquidityPositionsParamsValidator = z.object(
  getUserLiquidityPositionsSchema
);

type SwapTokensParams = z.infer<typeof swapTokensParamsValidator>;
type BorrowParams = z.infer<typeof borrowParamsValidator>;
type RepayParams = z.infer<typeof repayParamsValidator>;
type SupplyParams = z.infer<typeof supplyParamsValidator>;
type WithdrawParams = z.infer<typeof withdrawParamsValidator>;
type GetCapabilitiesParams = z.infer<typeof getCapabilitiesParamsValidator>;
type GetUserPositionsParams = z.infer<typeof getUserPositionsParamsValidator>;
type GetTokensParams = z.infer<typeof getTokensParamsValidator>;
type SupplyLiquidityParams = z.infer<typeof supplyLiquidityParamsValidator>;
type WithdrawLiquidityParams = z.infer<typeof withdrawLiquidityParamsValidator>;
type GetLiquidityPoolsParams = z.infer<typeof getLiquidityPoolsParamsValidator>;
type GetUserLiquidityPositionsParams = z.infer<
  typeof getUserLiquidityPositionsParamsValidator
>;

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
  {
    name: "supplyLiquidity",
    description:
      "Supply liquidity to a token pair using Ember On-chain Actions.",
    arguments: zodSchemaToMcpArgs(supplyLiquiditySchema),
  },
  {
    name: "withdrawLiquidity",
    description:
      "Withdraw liquidity from a position using Ember On-chain Actions.",
    arguments: zodSchemaToMcpArgs(withdrawLiquiditySchema),
  },
  {
    name: "getLiquidityPools",
    description:
      "Get a list of available liquidity pools using Ember On-chain Actions.",
    arguments: zodSchemaToMcpArgs(getLiquidityPoolsSchema),
  },
  {
    name: "getUserLiquidityPositions",
    description: "Get user's liquidity positions using Ember On-chain Actions.",
    arguments: zodSchemaToMcpArgs(getUserLiquidityPositionsSchema),
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

server.tool(
  "supplyLiquidity",
  "Supply liquidity to a token pair using Ember On-chain Actions.",
  supplyLiquiditySchema,
  async (params: SupplyLiquidityParams, extra: any) => {
    console.error(`Executing supplyLiquidity tool with params:`, params);
    console.error(`Extra object for supplyLiquidity:`, extra);

    try {
      const token0: TokenIdentifier = {
        chainId: params.token0ChainId,
        address: params.token0Address,
      };
      const token1: TokenIdentifier = {
        chainId: params.token1ChainId,
        address: params.token1Address,
      };

      const response = await emberClient.supplyLiquidity({
        token0: token0,
        token1: token1,
        amount0: params.amount0,
        amount1: params.amount1,
        // Assuming limited range supply as per agent example
        // TODO: Consider adding a 'fullRange' boolean parameter to the schema?
        fullRange: false,
        limitedRange: {
          minPrice: params.priceFrom,
          maxPrice: params.priceTo,
        },
        supplierAddress: params.userAddress,
      });

      // Adjusted error check: Rely on try/catch for gRPC errors,
      // check for presence of expected data (transactions)
      if (!response.transactions || response.transactions.length === 0) {
        throw new Error(
          // response.error?.message || // Removed direct error check
          "No transaction plan returned for supplyLiquidity"
        );
      }

      console.error(
        `SupplyLiquidity tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            // Return the transaction plan for the client to execute
            text: JSON.stringify(response.transactions),
          },
        ],
      };
    } catch (error) {
      console.error(`SupplyLiquidity tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "withdrawLiquidity",
  "Withdraw liquidity from a position using Ember On-chain Actions.",
  withdrawLiquiditySchema,
  async (params: WithdrawLiquidityParams, extra: any) => {
    console.error(`Executing withdrawLiquidity tool with params:`, params);
    console.error(`Extra object for withdrawLiquidity:`, extra);

    try {
      const response = await emberClient.withdrawLiquidity({
        tokenId: params.tokenId,
        providerId: params.providerId,
        supplierAddress: params.userAddress,
      });

      // Adjusted error check: Rely on try/catch for gRPC errors,
      // check for presence of expected data (transactions)
      if (!response.transactions || response.transactions.length === 0) {
        throw new Error(
          // response.error?.message || // Removed direct error check
          "No transaction plan returned for withdrawLiquidity"
        );
      }

      console.error(
        `WithdrawLiquidity tool success. Transactions:`,
        response.transactions
      );

      return {
        content: [
          {
            type: "text",
            // Return the transaction plan for the client to execute
            text: JSON.stringify(response.transactions),
          },
        ],
      };
    } catch (error) {
      console.error(`WithdrawLiquidity tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "getLiquidityPools",
  "Get a list of available liquidity pools using Ember On-chain Actions.",
  getLiquidityPoolsSchema,
  async (params: GetLiquidityPoolsParams, extra: any) => {
    console.error(`Executing getLiquidityPools tool with params:`, params);
    console.error(`Extra object for getLiquidityPools:`, extra);
    try {
      // Pass undefined if no args/metadata needed
      const response: GetLiquidityPoolsResponse =
        await emberClient.getLiquidityPools(undefined);

      // Check for expected data instead of response.error
      if (!response.liquidityPools) {
        throw new Error("No liquidity pools data returned.");
      }

      console.error(`getLiquidityPools tool success.`);
      return {
        content: [
          {
            type: "text",
            // Pass the whole response object as JSON
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      console.error(`getLiquidityPools tool error:`, error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
      };
    }
  }
);

server.tool(
  "getUserLiquidityPositions",
  "Get user's liquidity positions using Ember On-chain Actions.",
  getUserLiquidityPositionsSchema,
  async (params: GetUserLiquidityPositionsParams, extra: any) => {
    console.error(
      `Executing getUserLiquidityPositions tool with params:`,
      params
    );
    console.error(`Extra object for getUserLiquidityPositions:`, extra);

    try {
      // Use correct argument name: supplierAddress
      const response: GetUserLiquidityPositionsResponse =
        await emberClient.getUserLiquidityPositions({
          supplierAddress: params.userAddress,
        });

      // Check for expected data instead of response.error
      if (!response.positions) {
        throw new Error("No user liquidity positions data returned.");
      }

      console.error(`getUserLiquidityPositions tool success.`);
      return {
        content: [
          {
            type: "text",
            // Pass the whole response object as JSON
            text: JSON.stringify(response),
          },
        ],
      };
    } catch (error) {
      console.error(`getUserLiquidityPositions tool error:`, error);
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
