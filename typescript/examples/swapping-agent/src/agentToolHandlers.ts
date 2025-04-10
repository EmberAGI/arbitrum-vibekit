// Remove import from emberai-mcp index.js since we can't access it
// import {
//   // No longer directly importing from emberai-mcp
//   // ToolFunctions,
//   // TransactionPlan,
//   // GetWalletPositionsResponse,
//   // CapabilityType,
// } from "../../../typescript/mcp-tools/emberai-mcp/index.js";

import { z } from 'zod';
import { ethers } from 'ethers';

// Define a minimal MCPClient interface to match @modelcontextprotocol/sdk Client
interface MCPClient {
  callTool: (params: {
    name: string;
    arguments: Record<string, any>;
    _meta?: Record<string, unknown>;
  }) => Promise<any>;
  close: () => Promise<void>;
}

// Define Zod schema for TransactionPlan
export const TransactionPlanSchema = z
  .object({
    to: z.string(),
    data: z.string(),
    value: z.string().optional(),
    // Add other fields if needed based on actual server response
  })
  .passthrough(); // Allow unknown fields
// Infer type for use in handlers
export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;

// --- Handler Context Type ---

// Defines the state/methods handlers receive from the Agent
export interface HandlerContext {
  // Replace toolExecutor with mcpClient
  mcpClient: MCPClient;
  tokenMap: Record<string, { chainId: string; address: string; decimals: number }>;
  userAddress: string;
  executeAction: (actionName: string, transactions: TransactionPlan[]) => Promise<string>;
  log: (...args: unknown[]) => void;
}

// Helper function for case-insensitive token lookup
function findTokenCaseInsensitive(
  tokenMap: Record<string, { chainId: string; address: string; decimals: number }>,
  tokenName: string
): { chainId: string; address: string; decimals: number } | undefined {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      return tokenMap[key]; // Return the value associated with the original key
    }
  }
  return undefined; // Not found
}

// --- Stateless Handler Functions ---

// Helper function for validating transaction results
async function validateAndExecuteAction(
  actionName: string,
  rawTransactions: unknown,
  context: HandlerContext
): Promise<string> {
  const validationResult = z.array(TransactionPlanSchema).safeParse(rawTransactions);
  if (!validationResult.success) {
    const errorMsg = `MCP tool '${actionName}' returned invalid transaction data.`;
    context.log('Validation Error:', errorMsg, validationResult.error);
    throw new Error(errorMsg);
  }
  // Use validated data
  return await context.executeAction(actionName, validationResult.data);
}

export async function handleSwapTokens(
  params: { fromToken: string; toToken: string; amount: string },
  context: HandlerContext
): Promise<string> {
  const { fromToken, toToken, amount } = params;
  // Use the case-insensitive helper function for lookup
  const fromTokenDetail = findTokenCaseInsensitive(context.tokenMap, fromToken);
  const toTokenDetail = findTokenCaseInsensitive(context.tokenMap, toToken);
  if (!fromTokenDetail) {
    throw new Error(`Token ${fromToken} not found.`);
  }
  if (!toTokenDetail) {
    throw new Error(`Token ${toToken} not found.`);
  }

  const atomicAmount = ethers.utils.parseUnits(amount, fromTokenDetail.decimals);

  context.log(
    `Executing swap via MCP: ${fromToken} (address: ${fromTokenDetail.address}, chain: ${fromTokenDetail.chainId}) to ${toToken} (address: ${toTokenDetail.address}, chain: ${toTokenDetail.chainId}), amount: ${amount}, atomicAmount: ${atomicAmount}, userAddress: ${context.userAddress}`
  );

  const rawTransactions = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: {
      fromTokenAddress: fromTokenDetail.address,
      fromTokenChainId: fromTokenDetail.chainId,
      toTokenAddress: toTokenDetail.address,
      toTokenChainId: toTokenDetail.chainId,
      amount: atomicAmount.toString(),
      userAddress: context.userAddress,
    },
  });

  // --- Start Edit: Unwrap potential nested structure ---
  let dataToValidate: unknown;
  if (
    rawTransactions &&
    typeof rawTransactions === 'object' &&
    'content' in rawTransactions && // Check if 'content' key exists
    Array.isArray((rawTransactions as any).content) &&
    (rawTransactions as any).content.length > 0 &&
    (rawTransactions as any).content[0]?.type === 'text' &&
    typeof (rawTransactions as any).content[0]?.text === 'string'
  ) {
    context.log('Raw swapTokens result has nested structure, parsing inner text...');
    try {
      dataToValidate = JSON.parse((rawTransactions as any).content[0].text);
      context.log('Parsed inner text content for validation:', dataToValidate);
    } catch (e) {
      context.log('Error parsing inner text content from swapTokens result:', e);
      // Fallback or throw an error if parsing fails
      throw new Error(
        `Failed to parse nested JSON response from swapTokens: ${(e as Error).message}`
      );
    }
  } else {
    context.log('Raw swapTokens result does not have expected nested structure, validating as is.');
    dataToValidate = rawTransactions; // Validate the raw response directly
  }
  // --- End Edit ---

  // Pass the potentially unwrapped data to validation
  return await validateAndExecuteAction('swapTokens', dataToValidate, context);
}
