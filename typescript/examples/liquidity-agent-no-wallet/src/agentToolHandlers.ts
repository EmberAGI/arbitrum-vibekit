import { z } from 'zod';
import {
  parseUnits,
  createPublicClient,
  http,
  type Address,
  encodeFunctionData,
  type PublicClient,
  formatUnits,
} from 'viem';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task } from 'a2a-samples-js/schema';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';

import type { LiquidityPair, LiquidityPosition } from './agent.js';
import { getChainConfigById } from './agent.js';

export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

export const TransactionEmberSchema = z
  .object({
    to: z.string(),
    data: z.string(),
    value: z.string(),
  })
  .passthrough();

export type TransactionEmber = z.infer<typeof TransactionEmberSchema>;

export const TransactionResponseSchema = TransactionEmberSchema.extend({
  chainId: z.string(),
});

export type TransactionResponse = z.infer<typeof TransactionResponseSchema>;

export const TransactionArtifactSchema = z.object({
  txPreview: z.record(z.string(), z.unknown()),
  txPlan: z.array(TransactionResponseSchema),
});

export type TransactionArtifact = z.infer<typeof TransactionArtifactSchema>;

// --- Liquidity Specific Schemas Start ---
export const LiquidityPreviewSchema = z.object({
  action: z.enum(['supply', 'withdraw']),
  pairHandle: z.string().optional(), // Optional for withdraw if using positionNumber
  token0Symbol: z.string(),
  token0Amount: z.string(), // User provided amount for supply, estimated for withdraw
  token1Symbol: z.string(),
  token1Amount: z.string(), // User provided amount for supply, estimated for withdraw
  priceFrom: z.string().optional(), // Only for supply
  priceTo: z.string().optional(), // Only for supply
  positionNumber: z.number().optional(), // Only for withdraw
  // Add other relevant preview fields if needed
});

export const LiquidityTransactionArtifactSchema = z.object({
  txPreview: LiquidityPreviewSchema,
  txPlan: z.array(TransactionResponseSchema),
});

export type LiquidityTransactionArtifact = z.infer<typeof LiquidityTransactionArtifactSchema>;
// --- Liquidity Specific Schemas End ---

// --- Pools/Positions Artifact Schemas Start ---
// Define schema based on LiquidityPair type used internally
const LiquidityPairArtifactSchema = z.object({
  handle: z.string(),
  symbol0: z.string(),
  symbol1: z.string(),
  token0: z.object({
    // Use a simplified object for the artifact
    chainId: z.string(),
    address: z.string(),
    symbol: z.string().optional(),
    decimals: z.number().optional(),
  }),
  token1: z.object({
    // Use a simplified object for the artifact
    chainId: z.string(),
    address: z.string(),
    symbol: z.string().optional(),
    decimals: z.number().optional(),
  }),
});

export const LiquidityPoolsArtifactSchema = z.object({
  pools: z.array(LiquidityPairArtifactSchema),
});
export type LiquidityPoolsArtifact = z.infer<typeof LiquidityPoolsArtifactSchema>;

// Define schema based on LiquidityPosition type used internally
const LiquidityPositionArtifactSchema = z.object({
  tokenId: z.string(),
  providerId: z.string(),
  symbol0: z.string(),
  symbol1: z.string(),
  amount0: z.string(),
  amount1: z.string(),
  price: z.string(),
});

export const UserPositionsArtifactSchema = z.object({
  positions: z.array(LiquidityPositionArtifactSchema),
});
export type UserPositionsArtifact = z.infer<typeof UserPositionsArtifactSchema>;
// --- Pools/Positions Artifact Schemas End ---

// Schema for the MCP response of getUserLiquidityPositions
const EmberPositionSchema = z
  .object({
    tokenId: z.string(),
    providerId: z.string(),
    symbol0: z.string(),
    symbol1: z.string(),
    amount0: z.string(),
    amount1: z.string(),
    price: z.string(),
  })
  .passthrough();

const GetUserLiquidityPositionsResponseSchema = z
  .object({
    positions: z.array(EmberPositionSchema),
  })
  .passthrough();

// Zod schema for the actual TransactionPlan structure returned by Ember MCP tools
const TransactionPlanSchema = z
  .object({
    to: z.string(),
    data: z.string(),
    value: z.string(),
  })
  .passthrough();

// Schemas needed for handler function signatures (even if not used for MCP args)
const GetLiquidityPoolsSchema = z.object({});
const GetUserLiquidityPositionsSchema = z.object({});
// Need SupplyLiquiditySchema from agent.ts (or redefine) for handleSupplyLiquidity param type
// Let's assume it's implicitly available or redefine the relevant part for the handler signature
const SupplyLiquidityHandlerParamsSchema = z.object({
  pair: z.string(),
  amount0: z.string(),
  amount1: z.string(),
  priceFrom: z.string(),
  priceTo: z.string(),
});
const WithdrawLiquidityHandlerParamsSchema = z.object({
  positionNumber: z.number().int().positive(),
});

export interface HandlerContext {
  mcpClient: Client;
  userAddress: Address | undefined;
  log: (...args: unknown[]) => void;
  getPairs: () => LiquidityPair[];
  getPositions: () => LiquidityPosition[];
  updatePositions: (positions: LiquidityPosition[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

export function parseMcpToolResponse<T>(
  rawResponse: unknown,
  schema: z.ZodType<T>,
  context: HandlerContext,
  toolName: string
): T {
  let dataToValidate: unknown;

  if (
    rawResponse &&
    typeof rawResponse === 'object' &&
    'content' in rawResponse &&
    Array.isArray((rawResponse as any).content) &&
    (rawResponse as any).content.length > 0 &&
    (rawResponse as any).content[0]?.type === 'text' &&
    typeof (rawResponse as any).content[0]?.text === 'string'
  ) {
    context.log(`Attempting to parse nested JSON from ${toolName} response...`);
    try {
      const parsedJson = JSON.parse((rawResponse as any).content[0].text);
      dataToValidate = parsedJson;
    } catch (e) {
      context.log(`Error parsing nested JSON content from ${toolName} result:`, e);
      context.log(`Raw text content: ${(rawResponse as any).content[0].text}`);
      throw new Error(`Failed to parse nested JSON response from ${toolName}.`);
    }
  } else {
    context.log(
      `MCP response for ${toolName} does not have expected nested text structure, trying to validate directly.`
    );
    dataToValidate = rawResponse;
  }

  try {
    const validationResult = schema.parse(dataToValidate);
    context.log(`Successfully parsed and validated ${toolName} response.`);
    return validationResult;
  } catch (error) {
    context.log(`Error validating ${toolName} response against schema:`, error);
    if (error instanceof z.ZodError) {
      context.log('Zod validation errors:', JSON.stringify(error.errors, null, 2));
    }
    context.log('Data that failed validation:', JSON.stringify(dataToValidate, null, 2));
    throw new Error(`Invalid response structure received from ${toolName}.`);
  }
}

function createTaskResult(
  id: string | undefined,
  state: Task['status']['state'],
  message: string
): Task {
  // Simple version without artifacts
  return {
    id: id || 'liquidity-agent-task',
    status: {
      state: state,
      message: { role: 'agent', parts: [{ type: 'text', text: message }] },
    },
  };
}

export async function handleGetLiquidityPools(
  _params: z.infer<typeof GetLiquidityPoolsSchema>,
  context: HandlerContext
): Promise<Task> {
  context.log('Handling getLiquidityPools...');
  try {
    const pairs = context.getPairs();

    if (pairs.length === 0) {
      return createTaskResult(context.userAddress, 'completed', 'No liquidity pools available.');
    }

    let responseText = 'Available Liquidity Pools:\n';
    pairs.forEach(pair => {
      responseText += `- ${pair.handle}\n`;
    });

    // Construct artifact directly in Task structure
    const poolsArtifact: LiquidityPoolsArtifact = { pools: pairs };

    return {
      id: context.userAddress || 'liquidity-agent-task',
      status: {
        state: 'completed',
        message: { role: 'agent', parts: [{ type: 'text', text: responseText }] },
      },
      artifacts: [
        {
          name: 'available-liquidity-pools',
          parts: [{ type: 'data', data: poolsArtifact }],
        },
      ],
    };
  } catch (error) {
    const errorMsg = `Error in handleGetLiquidityPools: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, 'failed', errorMsg);
  }
}

export async function handleGetUserLiquidityPositions(
  _params: z.infer<typeof GetUserLiquidityPositionsSchema>,
  context: HandlerContext
): Promise<Task> {
  context.log('Handling getUserLiquidityPositions...');
  if (!context.userAddress) {
    return createTaskResult(undefined, 'failed', 'User address not available in context.');
  }

  try {
    const mcpArgs = { userAddress: context.userAddress };
    // Explicitly cast arguments for callTool to satisfy linter
    const mcpResponse = await context.mcpClient.callTool({
      name: 'getUserLiquidityPositions',
      arguments: mcpArgs,
    });

    const validatedData = parseMcpToolResponse(
      mcpResponse,
      GetUserLiquidityPositionsResponseSchema,
      context,
      'getUserLiquidityPositions'
    );

    const positions: LiquidityPosition[] = validatedData.positions.map(pos => ({
      tokenId: pos.tokenId,
      providerId: pos.providerId,
      symbol0: pos.symbol0,
      symbol1: pos.symbol1,
      amount0: pos.amount0,
      amount1: pos.amount1,
      price: pos.price,
    }));
    context.updatePositions(positions);
    context.log(`Updated internal state with ${positions.length} positions.`);

    if (positions.length === 0) {
      return createTaskResult(context.userAddress, 'completed', 'No liquidity positions found.');
    }

    let responseText = 'Your Liquidity Positions:\n\n';
    positions.forEach((pos, index) => {
      responseText += `${index + 1}: ${pos.symbol0}/${pos.symbol1}\n`;
      responseText += `  Amount0: ${pos.amount0} ${pos.symbol0}\n`;
      responseText += `  Amount1: ${pos.amount1} ${pos.symbol1}\n`;
      responseText += `  Price: ${pos.price}\n`;
    });

    // Construct artifact
    const positionsArtifact: UserPositionsArtifact = { positions };

    return {
      id: context.userAddress || 'liquidity-agent-task',
      status: {
        state: 'completed',
        message: { role: 'agent', parts: [{ type: 'text', text: responseText }] },
      },
      artifacts: [
        {
          name: 'user-liquidity-positions',
          parts: [{ type: 'data', data: positionsArtifact }],
        },
      ],
    };
  } catch (error) {
    const errorMsg = `Error in handleGetUserLiquidityPositions: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, 'failed', errorMsg);
  }
}

export async function handleSupplyLiquidity(
  params: z.infer<typeof SupplyLiquidityHandlerParamsSchema>,
  context: HandlerContext
): Promise<Task> {
  context.log('Handling supplyLiquidity with params:', params);
  const userAddress = context.userAddress;
  if (!userAddress) {
    return createTaskResult(undefined, 'failed', 'User address not available in context.');
  }

  try {
    const pairs = context.getPairs();
    const selectedPair = pairs.find(p => p.handle === params.pair);

    if (!selectedPair) {
      return createTaskResult(
        userAddress,
        'failed',
        `Liquidity pair handle "${params.pair}" not found or not supported.`
      );
    }

    // --- Balance Check Start ---
    context.log(`Checking balances for user ${userAddress} for pair ${selectedPair.handle}`);
    const { token0, token1 } = selectedPair;
    const { quicknodeSubdomain, quicknodeApiKey } = context;

    // Validate decimals exist
    if (token0.decimals === undefined || token1.decimals === undefined) {
      const missing = [];
      if (token0.decimals === undefined) missing.push(token0.symbol || token0.address);
      if (token1.decimals === undefined) missing.push(token1.symbol || token1.address);
      const errorMsg = `Cannot check balance: Missing decimal information for token(s): ${missing.join(', ')}`;
      context.log('Error:', errorMsg);
      return createTaskResult(userAddress, 'failed', errorMsg);
    }

    // Function to create client (avoids duplicated code)
    const createClient = (chainId: string): PublicClient => {
      const chainConfig = getChainConfigById(chainId);
      const networkSegment = chainConfig.quicknodeSegment;
      const targetChain = chainConfig.viemChain;
      let dynamicRpcUrl: string;
      if (networkSegment === '') {
        dynamicRpcUrl = `https://${quicknodeSubdomain}.quiknode.pro/${quicknodeApiKey}`;
      } else {
        dynamicRpcUrl = `https://${quicknodeSubdomain}.${networkSegment}.quiknode.pro/${quicknodeApiKey}`;
      }
      return createPublicClient({
        chain: targetChain,
        transport: http(dynamicRpcUrl),
      });
    };

    // Create clients for both token chains
    let client0: PublicClient;
    let client1: PublicClient;
    try {
      client0 = createClient(token0.chainId);
      client1 = token0.chainId === token1.chainId ? client0 : createClient(token1.chainId);
      context.log(`Public clients created for chains ${token0.chainId} and ${token1.chainId}.`);
    } catch (chainError) {
      const errorMsg = `Network configuration error: ${(chainError as Error).message}`;
      context.log(errorMsg);
      return createTaskResult(userAddress, 'failed', errorMsg);
    }

    // Prepare amounts
    let amount0Atomic: bigint;
    let amount1Atomic: bigint;
    try {
      amount0Atomic = parseUnits(params.amount0, token0.decimals);
      amount1Atomic = parseUnits(params.amount1, token1.decimals);
    } catch (parseError) {
      const errorMsg = `Invalid amount format: ${(parseError as Error).message}`;
      context.log(errorMsg);
      return createTaskResult(userAddress, 'failed', errorMsg);
    }

    // Check balances
    try {
      const balance0 = (await client0.readContract({
        address: token0.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      })) as bigint;
      context.log(`Balance check ${token0.symbol}: Has ${balance0}, needs ${amount0Atomic}`);

      if (balance0 < amount0Atomic) {
        const formattedBalance = formatUnits(balance0, token0.decimals);
        const errorMsg = `Insufficient ${token0.symbol} balance. You need ${params.amount0} but only have ${formattedBalance}.`;
        context.log(errorMsg);
        return createTaskResult(userAddress, 'failed', errorMsg);
      }

      const balance1 = (await client1.readContract({
        address: token1.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      })) as bigint;
      context.log(`Balance check ${token1.symbol}: Has ${balance1}, needs ${amount1Atomic}`);

      if (balance1 < amount1Atomic) {
        const formattedBalance = formatUnits(balance1, token1.decimals);
        const errorMsg = `Insufficient ${token1.symbol} balance. You need ${params.amount1} but only have ${formattedBalance}.`;
        context.log(errorMsg);
        return createTaskResult(userAddress, 'failed', errorMsg);
      }

      context.log('Sufficient balances confirmed for both tokens.');
    } catch (readError) {
      const errorMsg = `Could not verify token balance due to a network error: ${(readError as Error).message}`;
      context.log(`Warning: Failed to read token balance.`, readError);
      return createTaskResult(userAddress, 'failed', errorMsg);
    }
    // --- Balance Check End ---

    const mcpArgs = {
      token0Address: selectedPair.token0.address,
      token0ChainId: selectedPair.token0.chainId,
      token1Address: selectedPair.token1.address,
      token1ChainId: selectedPair.token1.chainId,
      amount0: params.amount0,
      amount1: params.amount1,
      priceFrom: params.priceFrom,
      priceTo: params.priceTo,
      userAddress: context.userAddress,
    };
    context.log('Calling supplyLiquidity MCP tool with args:', mcpArgs);

    // Explicitly cast arguments for callTool
    const mcpResponse = await context.mcpClient.callTool({
      name: 'supplyLiquidity',
      arguments: mcpArgs,
    });

    const txPlanRaw = parseMcpToolResponse(
      mcpResponse,
      z.array(TransactionPlanSchema),
      context,
      'supplyLiquidity'
    );

    context.log('Received raw transaction plan for supplyLiquidity:', txPlanRaw);

    // Manually add chainId (assuming all txs are on the same chain as token0 for simplicity)
    // A more robust implementation might check chain IDs if cross-chain liquidity is possible
    const txPlan: TransactionResponse[] = txPlanRaw.map(tx => ({
      ...tx,
      chainId: token0.chainId,
    }));

    // --- Allowance Check & Approval Tx Start ---
    const approveTxs: TransactionResponse[] = [];

    if (!txPlan || txPlan.length === 0 || !txPlan[0]?.to) {
      const errorMsg =
        'Invalid transaction plan received from supplyLiquidity tool (missing first transaction or spender address).';
      context.log(errorMsg, txPlanRaw);
      return createTaskResult(userAddress, 'failed', errorMsg);
    }

    const spenderAddress = txPlan[0].to as Address;
    context.log(`Identified spender address: ${spenderAddress} from txPlan[0].to`);

    // Check allowance for token0
    try {
      context.log(
        `Checking allowance for ${token0.symbol} (${token0.address}) to spender ${spenderAddress}`
      );
      const allowance0 = (await client0.readContract({
        address: token0.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'allowance',
        args: [userAddress, spenderAddress],
      })) as bigint;
      context.log(`Allowance check ${token0.symbol}: Has ${allowance0}, needs ${amount0Atomic}`);

      if (allowance0 < amount0Atomic) {
        context.log(`Insufficient allowance for ${token0.symbol}. Adding approval transaction.`);
        approveTxs.push({
          to: token0.address as Address,
          data: encodeFunctionData({
            abi: Erc20Abi.abi,
            functionName: 'approve',
            // Approve max uint256
            args: [
              spenderAddress,
              0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
            ],
          }),
          value: '0',
          chainId: token0.chainId,
        });
      } else {
        context.log(`Sufficient allowance for ${token0.symbol}.`);
      }
    } catch (readError) {
      const errorMsg = `Could not verify ${token0.symbol} allowance due to a network error: ${(readError as Error).message}`;
      context.log(`Warning: Failed to read ${token0.symbol} allowance.`, readError);
      // Decide if we should fail or proceed assuming approval is needed
      // For now, let's fail to be safe.
      return createTaskResult(userAddress, 'failed', errorMsg);
    }

    // Check allowance for token1
    try {
      context.log(
        `Checking allowance for ${token1.symbol} (${token1.address}) to spender ${spenderAddress}`
      );
      const allowance1 = (await client1.readContract({
        address: token1.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'allowance',
        args: [userAddress, spenderAddress],
      })) as bigint;
      context.log(`Allowance check ${token1.symbol}: Has ${allowance1}, needs ${amount1Atomic}`);

      if (allowance1 < amount1Atomic) {
        context.log(`Insufficient allowance for ${token1.symbol}. Adding approval transaction.`);
        // Check if we already added an approval for this token (unlikely but possible if spender is the same)
        // This check is simple; more robust checks might compare chainId and address.
        if (!approveTxs.some(tx => tx.to.toLowerCase() === token1.address.toLowerCase())) {
          approveTxs.push({
            to: token1.address as Address,
            data: encodeFunctionData({
              abi: Erc20Abi.abi,
              functionName: 'approve',
              // Approve max uint256
              args: [
                spenderAddress,
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
              ],
            }),
            value: '0',
            chainId: token1.chainId,
          });
        } else {
          context.log(`Approval for ${token1.symbol} already added.`);
        }
      } else {
        context.log(`Sufficient allowance for ${token1.symbol}.`);
      }
    } catch (readError) {
      const errorMsg = `Could not verify ${token1.symbol} allowance due to a network error: ${(readError as Error).message}`;
      context.log(`Warning: Failed to read ${token1.symbol} allowance.`, readError);
      // Decide if we should fail or proceed assuming approval is needed
      // For now, let's fail to be safe.
      return createTaskResult(userAddress, 'failed', errorMsg);
    }

    const finalTxPlan: TransactionResponse[] = [...approveTxs, ...txPlan];
    context.log(
      `Final transaction plan (${finalTxPlan.length} txs, including ${approveTxs.length} approvals):`,
      finalTxPlan
    );
    // --- Allowance Check & Approval Tx End ---

    // --- Construct Artifact Start ---
    const artifact: LiquidityTransactionArtifact = {
      txPreview: {
        action: 'supply',
        pairHandle: selectedPair.handle,
        token0Symbol: selectedPair.symbol0,
        token0Amount: params.amount0, // User provided amount
        token1Symbol: selectedPair.symbol1,
        token1Amount: params.amount1, // User provided amount
        priceFrom: params.priceFrom,
        priceTo: params.priceTo,
      },
      txPlan: finalTxPlan,
    };
    // --- Construct Artifact End ---

    return {
      id: context.userAddress || 'liquidity-agent-task',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Supply liquidity transaction plan prepared (${finalTxPlan.length} txs). Please review and execute.`,
            },
          ],
        },
      },
      artifacts: [
        {
          name: 'liquidity-transaction',
          parts: [{ type: 'data', data: artifact }],
        },
      ],
    };
  } catch (error) {
    const errorMsg = `Error in handleSupplyLiquidity: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, 'failed', errorMsg);
  }
}

export async function handleWithdrawLiquidity(
  params: z.infer<typeof WithdrawLiquidityHandlerParamsSchema>,
  context: HandlerContext
): Promise<Task> {
  context.log('Handling withdrawLiquidity with params:', params);
  if (!context.userAddress) {
    return createTaskResult(undefined, 'failed', 'User address not available in context.');
  }

  try {
    const positions = context.getPositions();
    const positionIndex = params.positionNumber - 1;

    if (positionIndex < 0 || positionIndex >= positions.length) {
      return createTaskResult(
        context.userAddress,
        'failed',
        `Invalid position number: ${params.positionNumber}. Please choose from 1 to ${positions.length}.`
      );
    }
    const selectedPosition = positions[positionIndex];
    if (!selectedPosition) {
      return createTaskResult(
        context.userAddress,
        'failed',
        `Internal error: Position at index ${positionIndex} is unexpectedly undefined.`
      );
    }

    const mcpArgs = {
      tokenId: selectedPosition.tokenId,
      providerId: selectedPosition.providerId,
      userAddress: context.userAddress,
    };
    context.log('Calling withdrawLiquidity MCP tool with args:', mcpArgs);

    // Explicitly cast arguments for callTool
    const mcpResponse = await context.mcpClient.callTool({
      name: 'withdrawLiquidity',
      arguments: mcpArgs,
    });

    // Parse without chainId first
    const txPlanRaw = parseMcpToolResponse(
      mcpResponse,
      z.array(TransactionPlanSchema), // Use base schema
      context,
      'withdrawLiquidity'
    );
    context.log('Received raw transaction plan for withdrawLiquidity:', txPlanRaw);

    // Find the pair to get token details (needed for chainId)
    const pairs = context.getPairs();
    // Find pair based on symbols from the position
    const correspondingPair = pairs.find(
      p =>
        (p.symbol0 === selectedPosition.symbol0 && p.symbol1 === selectedPosition.symbol1) ||
        (p.symbol0 === selectedPosition.symbol1 && p.symbol1 === selectedPosition.symbol0)
    );

    if (!correspondingPair) {
      // This should ideally not happen if positions are derived from available pairs
      return createTaskResult(
        context.userAddress,
        'failed',
        `Could not find corresponding pair details for position symbols ${selectedPosition.symbol0}/${selectedPosition.symbol1}`
      );
    }

    // Manually add chainId using the found pair's token0 chainId
    const txPlan: TransactionResponse[] = txPlanRaw.map(tx => ({
      ...tx,
      chainId: correspondingPair.token0.chainId, // Use chainId from found pair
    }));

    context.log('Transaction plan with chainId added:', txPlan);

    // --- Construct Artifact Start ---
    const artifact: LiquidityTransactionArtifact = {
      txPreview: {
        action: 'withdraw',
        positionNumber: params.positionNumber,
        pairHandle: correspondingPair.handle, // Add handle from pair
        token0Symbol: selectedPosition.symbol0,
        token0Amount: selectedPosition.amount0, // Placeholder amount
        token1Symbol: selectedPosition.symbol1,
        token1Amount: selectedPosition.amount1, // Placeholder amount
        // priceFrom, priceTo are omitted
      },
      txPlan: txPlan, // Use the plan with chainId added
    };
    // --- Construct Artifact End ---

    return {
      id: context.userAddress || 'liquidity-agent-task',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: 'Withdraw liquidity transaction plan prepared. Please review and execute.',
            },
          ],
        },
      },
      artifacts: [
        {
          name: 'liquidity-transaction',
          parts: [{ type: 'data', data: artifact }],
        },
      ],
    };
  } catch (error) {
    const errorMsg = `Error in handleWithdrawLiquidity: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, 'failed', errorMsg);
  }
}
