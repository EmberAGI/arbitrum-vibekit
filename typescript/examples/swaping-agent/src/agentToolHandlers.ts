// Remove import from emberai-mcp index.js since we can't access it
// import {
//   // No longer directly importing from emberai-mcp
//   // ToolFunctions,
//   // TransactionPlan,
//   // GetWalletPositionsResponse,
//   // CapabilityType,
// } from "../../../typescript/mcp-tools/emberai-mcp/index.js";

import { z } from 'zod';

// Define a minimal MCPClient interface to match @modelcontextprotocol/sdk Client
interface MCPClient {
  callTool: (params: { 
    name: string; 
    arguments: Record<string, any>; 
    _meta?: Record<string, unknown> 
  }) => Promise<any>;
  close: () => Promise<void>;
}

// Define Zod schema for TransactionPlan
export const TransactionPlanSchema = z.object({
  to: z.string(),
  data: z.string(),
  value: z.string().optional(),
  // Add other fields if needed based on actual server response
}).passthrough(); // Allow unknown fields
// Infer type for use in handlers
export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;

// --- LLM-Facing Tool Schemas ---
// Keep this for reference, but agent.ts defines the tools now using Vercel AI SDK format

export const agentTools = [
  {
    name: "borrow",
    description:
      "Borrow a token. Provide the token name (e.g., USDC, WETH) and a human-readable amount.",
    parameters: {
      type: "object",
      properties: {
        tokenName: {
          type: "string",
          description: "The name of the token to borrow (e.g., USDC, WETH).",
        },
        amount: {
          type: "string",
          description: "The amount to borrow (human readable, e.g., '100', '0.5').",
        },
      },
      required: ["tokenName", "amount"],
    },
  },
  {
    name: "repay",
    description:
      "Repay a borrowed token. Provide the token name and a human-readable amount.",
    parameters: {
      type: "object",
      properties: {
        tokenName: {
          type: "string",
          description: "The name of the token to repay.",
        },
        amount: {
          type: "string",
          description: "The amount to repay.",
        },
      },
      required: ["tokenName", "amount"],
    },
  },
  {
    name: "supply",
    description:
      "Supply (deposit) a token. Provide the token name and a human-readable amount.",
    parameters: {
      type: "object",
      properties: {
        tokenName: {
          type: "string",
          description: "The name of the token to supply.",
        },
        amount: {
          type: "string",
          description: "The amount to supply.",
        },
      },
      required: ["tokenName", "amount"],
    },
  },
  {
    name: "withdraw",
    description:
      "Withdraw a previously supplied token. Provide the token name and a human-readable amount.",
    parameters: {
      type: "object",
      properties: {
        tokenName: {
          type: "string",
          description: "The name of the token to withdraw.",
        },
        amount: {
          type: "string",
          description: "The amount to withdraw.",
        },
      },
      required: ["tokenName", "amount"],
    },
  },
  {
    name: "getUserPositions",
    description:
      "Get a summary of your current lending and borrowing positions.",
    // No parameters needed from the LLM, userAddress is added by the agent
    parameters: { type: "object", properties: {} },
  },
  // Add getCapabilities schema if you expose that via a handler
  // {
  //   name: "getCapabilities",
  //   description: "Get lending/borrowing capabilities.",
  //   parameters: {
  //     type: "object",
  //     properties: {
  //       type: {
  //         type: "string",
  //         enum: [`${CapabilityType.LENDING}`], // Example
  //         description: "The type of capabilities to get.",
  //       },
  //     },
  //     required: ["type"],
  //   },
  // },
];

// --- Handler Context Type ---

// Defines the state/methods handlers receive from the Agent
export interface HandlerContext {
  // Replace toolExecutor with mcpClient
  mcpClient: MCPClient;
  tokenMap: Record<string, { chainId: string; address: string }>;
  userAddress: string;
  executeAction: (
    actionName: string,
    transactions: TransactionPlan[],
  ) => Promise<string>;
  log: (...args: unknown[]) => void;
  // Use a generic type parameter since we don't have GetWalletPositionsResponse
  describeWalletPositionsResponse: (
    response: any, // Generic response type from MCP server
  ) => string;
}

// --- Stateless Handler Functions ---

// Helper function for validating transaction results
async function validateAndExecuteAction(
  actionName: string,
  rawTransactions: unknown, // Result from mcpClient.callTool
  context: HandlerContext
): Promise<string> {
  const validationResult = z.array(TransactionPlanSchema).safeParse(rawTransactions);
  if (!validationResult.success) {
    const errorMsg = `MCP tool '${actionName}' returned invalid transaction data.`;
    context.log("Validation Error:", errorMsg, validationResult.error);
    throw new Error(errorMsg);
  }
  // Use validated data
  return await context.executeAction(actionName, validationResult.data);
}

export async function handleBorrow(
  params: { tokenName: string; amount: string },
  context: HandlerContext,
): Promise<string> {
  const { tokenName, amount } = params;
  const tokenDetail = context.tokenMap[tokenName];
  if (!tokenDetail)
    throw new Error(`Token ${tokenName} not available for borrowing.`);

  context.log(
    `Executing borrow via MCP: ${tokenName} (address: ${tokenDetail.address}, chain: ${tokenDetail.chainId}), amount: ${amount}`,
  );
  
  const rawTransactions = await context.mcpClient.callTool({
    name: "borrow",
    arguments: {
      tokenAddress: tokenDetail.address,
      tokenChainId: tokenDetail.chainId,
      amount,
      userAddress: context.userAddress,
    }
  });
  
  // Validate and execute
  return await validateAndExecuteAction("borrow", rawTransactions, context);
}

export async function handleRepay(
  params: { tokenName: string; amount: string },
  context: HandlerContext,
): Promise<string> {
  const { tokenName, amount } = params;
  const tokenDetail = context.tokenMap[tokenName];
  if (!tokenDetail) throw new Error(`Token ${tokenName} not found.`);
  
  context.log(
    `Executing repay via MCP: ${tokenName} (address: ${tokenDetail.address}, chain: ${tokenDetail.chainId}), amount: ${amount}`,
  );
  
  const rawTransactions = await context.mcpClient.callTool({
    name: "repay",
    arguments: {
      tokenAddress: tokenDetail.address,
      tokenChainId: tokenDetail.chainId,
      amount,
      userAddress: context.userAddress,
    }
  });
  
  return await validateAndExecuteAction("repay", rawTransactions, context);
}

export async function handleSupply(
  params: { tokenName: string; amount: string },
  context: HandlerContext,
): Promise<string> {
  const { tokenName, amount } = params;
  const tokenDetail = context.tokenMap[tokenName];
  if (!tokenDetail)
    throw new Error(`Token ${tokenName} not available for supplying.`);
  
  context.log(
    `Executing supply via MCP: ${tokenName} (address: ${tokenDetail.address}, chain: ${tokenDetail.chainId}), amount: ${amount}`,
  );
  
  const rawTransactions = await context.mcpClient.callTool({
    name: "supply",
    arguments: {
      tokenAddress: tokenDetail.address,
      tokenChainId: tokenDetail.chainId,
      amount,
      userAddress: context.userAddress,
    }
  });
  
  return await validateAndExecuteAction("supply", rawTransactions, context);
}

export async function handleWithdraw(
  params: { tokenName: string; amount: string },
  context: HandlerContext,
): Promise<string> {
  const { tokenName, amount } = params;
  const tokenDetail = context.tokenMap[tokenName];
  if (!tokenDetail)
    throw new Error(`Token ${tokenName} not available for withdrawing.`);
  
  context.log(
    `Executing withdraw via MCP: ${tokenName} (address: ${tokenDetail.address}, chain: ${tokenDetail.chainId}), amount: ${amount}`,
  );
  
  const rawTransactions = await context.mcpClient.callTool({
    name: "withdraw",
    arguments: {
      tokenAddress: tokenDetail.address,
      tokenChainId: tokenDetail.chainId,
      amount,
      userAddress: context.userAddress,
    }
  });

  return await validateAndExecuteAction("withdraw", rawTransactions, context);
}

export async function handleGetUserPositions(
  params: Record<string, unknown>, // No specific params from LLM needed
  context: HandlerContext,
): Promise<string> {
  // Use mcpClient.callTool instead of toolExecutor.getUserPositions
  const positionsResponse = await context.mcpClient.callTool({
    name: "getUserPositions",
    arguments: { userAddress: context.userAddress }
  });
  
  return context.describeWalletPositionsResponse(positionsResponse);
}

// Add handleGetCapabilities if needed (adapt to use mcpClient)
// export async function handleGetCapabilities(
//   params: { type: string },
//   context: HandlerContext,
// ): Promise<string> {
//   const response = await context.mcpClient.callTool({
//     name: "getCapabilities",
//     arguments: { type: params.type }
//   });
//   return `Capabilities loaded. Available token types: ...`; // Format response
// } 