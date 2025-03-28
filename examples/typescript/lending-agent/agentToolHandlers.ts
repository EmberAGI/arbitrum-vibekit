import {
  ToolFunctions,
  TransactionPlan,
  GetWalletPositionsResponse,
  // Explicitly import types needed for context and params
  CapabilityType,
} from "../../../mcp-tools/typescript/emberai-mcp/index.js";

// --- LLM-Facing Tool Schemas ---

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
  toolExecutor: ToolFunctions;
  tokenMap: Record<string, { chainId: string; address: string }>;
  userAddress: string;
  executeAction: (
    actionName: string,
    transactions: TransactionPlan[],
  ) => Promise<string>;
  log: (...args: unknown[]) => void;
  describeWalletPositionsResponse: (
    response: GetWalletPositionsResponse,
  ) => string;
}

// --- Stateless Handler Functions ---

export async function handleBorrow(
  params: { tokenName: string; amount: string },
  context: HandlerContext,
): Promise<string> {
  const { tokenName, amount } = params;
  const tokenDetail = context.tokenMap[tokenName];
  if (!tokenDetail)
    throw new Error(`Token ${tokenName} not available for borrowing.`);

  context.log(
    `Executing borrow: ${tokenName} (address: ${tokenDetail.address}, chain: ${tokenDetail.chainId}), amount: ${amount}`,
  );
  const transactions = await context.toolExecutor.borrow({
    tokenAddress: tokenDetail.address,
    tokenChainId: tokenDetail.chainId,
    amount,
    userAddress: context.userAddress,
  });
  return await context.executeAction("borrow", transactions);
}

export async function handleRepay(
  params: { tokenName: string; amount: string },
  context: HandlerContext,
): Promise<string> {
  const { tokenName, amount } = params;
  const tokenDetail = context.tokenMap[tokenName];
  if (!tokenDetail) throw new Error(`Token ${tokenName} not found.`);
  context.log(
    `Executing repay: ${tokenName} (address: ${tokenDetail.address}, chain: ${tokenDetail.chainId}), amount: ${amount}`,
  );
  const transactions = await context.toolExecutor.repay({
    tokenAddress: tokenDetail.address,
    tokenChainId: tokenDetail.chainId,
    amount,
    userAddress: context.userAddress,
  });
  return await context.executeAction("repay", transactions);
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
    `Executing supply: ${tokenName} (address: ${tokenDetail.address}, chain: ${tokenDetail.chainId}), amount: ${amount}`,
  );
  const transactions = await context.toolExecutor.supply({
    tokenAddress: tokenDetail.address,
    tokenChainId: tokenDetail.chainId,
    amount,
    userAddress: context.userAddress,
  });
  return await context.executeAction("supply", transactions);
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
    `Executing withdraw: ${tokenName} (address: ${tokenDetail.address}, chain: ${tokenDetail.chainId}), amount: ${amount}`,
  );
  const transactions = await context.toolExecutor.withdraw({
    tokenAddress: tokenDetail.address,
    tokenChainId: tokenDetail.chainId,
    amount,
    userAddress: context.userAddress,
  });
  return await context.executeAction("withdraw", transactions);
}

export async function handleGetUserPositions(
  params: Record<string, unknown>, // No specific params from LLM needed
  context: HandlerContext,
): Promise<string> {
  context.log("Executing getUserPositions");
  const positionsResponse = await context.toolExecutor.getUserPositions({
    userAddress: context.userAddress,
  });
  return context.describeWalletPositionsResponse(positionsResponse);
}

// Add handleGetCapabilities if needed
// export async function handleGetCapabilities(
//   params: { type: CapabilityType },
//   context: HandlerContext,
// ): Promise<GetCapabilitiesResponse> { // Or string description
//   context.log(`Executing getCapabilities for type: ${params.type}`);
//   const response = await context.toolExecutor.getCapabilities({ type: params.type });
//   // Return raw response or format it
//   return response;
// } 