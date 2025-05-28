import { z } from 'zod';
import {
  parseUnits,
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  formatUnits,
} from 'viem';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task, DataPart, Artifact } from 'a2a-samples-js';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };
import { parseMcpToolResponsePayload, type TransactionArtifact } from 'arbitrum-vibekit';
import {
  GetLiquidityPoolsSchema,
  GetUserLiquidityPositionsSchema,
  SupplyLiquiditySchema,
  WithdrawLiquiditySchema,
  GetUserLiquidityPositionsResponseSchema,
  TransactionPlanSchema,
  type LiquidityPoolsArtifact,
  type UserPositionsArtifact,
  type TransactionPlan,
} from 'ember-schemas';
import type { LiquidityPair, LiquidityPosition } from './agent.js';
import { getChainConfigById } from './agent.js';

export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

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
      // No liquidity pools available: return an empty artifact
      return {
        id: context.userAddress || 'liquidity-agent-task',
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: 'No liquidity pools available.' }],
          },
        },
        artifacts: [
          {
            name: 'available-liquidity-pools',
            parts: [{ type: 'data', data: { pools: [] } as LiquidityPoolsArtifact }],
          },
        ],
      };
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

    const validatedData = parseMcpToolResponsePayload(
      mcpResponse,
      GetUserLiquidityPositionsResponseSchema
    );

    // Use the validatedData.positions array directly, as it matches the new schema
    const positions = validatedData.positions;
    context.updatePositions(positions);
    context.log(`Updated internal state with ${positions.length} positions.`);

    if (positions.length === 0) {
      // No liquidity positions found: return an empty artifact
      return {
        id: context.userAddress || 'liquidity-agent-task',
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: 'No liquidity positions found.' }],
          },
        },
        artifacts: [
          {
            name: 'user-liquidity-positions',
            parts: [{ type: 'data', data: { positions: [] } as UserPositionsArtifact }],
          },
        ],
      };
    }

    let responseText = 'Your Liquidity Positions:\n\n';
    positions.forEach((pos, index) => {
      responseText += `${index + 1}: ${pos.symbol0}/${pos.symbol1}\n`;
      responseText += `  Amount0: ${pos.amount0} ${pos.symbol0}\n`;
      responseText += `  Amount1: ${pos.amount1} ${pos.symbol1}\n`;
      responseText += `  Price: ${pos.price}\n`;
      responseText += `  Price Range: ${
        pos.positionRange
          ? pos.positionRange.fromPrice + ' to ' + pos.positionRange.toPrice
          : '0 to ∞'
      }\n`;
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
  params: z.infer<typeof SupplyLiquiditySchema>,
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

    // --- Fetch Decimals & Balance/Allowance Check Start ---
    context.log(
      `Fetching info and checking balances/allowances for user ${userAddress} for pair ${selectedPair.handle}`
    );
    const { token0, token1 } = selectedPair;
    const { quicknodeSubdomain, quicknodeApiKey } = context;

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

    // Fetch Decimals
    let decimals0: number;
    let decimals1: number;
    try {
      context.log(`Fetching decimals for ${token0.symbol || token0.address}...`);
      decimals0 = (await client0.readContract({
        address: token0.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'decimals',
        args: [],
      })) as number;
      context.log(`Decimals for ${token0.symbol || token0.address}: ${decimals0}`);

      context.log(`Fetching decimals for ${token1.symbol || token1.address}...`);
      decimals1 =
        token0.address === token1.address && token0.chainId === token1.chainId
          ? decimals0 // Avoid refetching if same token/chain
          : ((await client1.readContract({
              address: token1.address as Address,
              abi: Erc20Abi.abi,
              functionName: 'decimals',
              args: [],
            })) as number);
      context.log(`Decimals for ${token1.symbol || token1.address}: ${decimals1}`);

      // Basic validation
      if (typeof decimals0 !== 'number' || typeof decimals1 !== 'number') {
        throw new Error('Failed to retrieve valid decimal numbers for tokens.');
      }
    } catch (fetchError) {
      const errorMsg = `Could not fetch token decimals: ${(fetchError as Error).message}`;
      context.log('Error:', errorMsg);
      // Add which token failed if possible
      return createTaskResult(userAddress, 'failed', errorMsg);
    }

    // Prepare amounts using fetched decimals
    let amount0Atomic: bigint;
    let amount1Atomic: bigint;
    try {
      amount0Atomic = parseUnits(params.amount0, decimals0);
      amount1Atomic = parseUnits(params.amount1, decimals1);
    } catch (parseError) {
      const errorMsg = `Invalid amount format: ${(parseError as Error).message}`;
      context.log(errorMsg);
      return createTaskResult(userAddress, 'failed', errorMsg);
    }

    // Check balances using fetched decimals
    try {
      const balance0 = (await client0.readContract({
        address: token0.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      })) as bigint;
      context.log(`Balance check ${token0.symbol}: Has ${balance0}, needs ${amount0Atomic}`);

      if (balance0 < amount0Atomic) {
        const formattedBalance = formatUnits(balance0, decimals0);
        const errorMsg = `Insufficient ${token0.symbol || 'Token0'} balance. You need ${params.amount0} but only have ${formattedBalance}.`;
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
        const formattedBalance = formatUnits(balance1, decimals1);
        const errorMsg = `Insufficient ${token1.symbol || 'Token1'} balance. You need ${params.amount1} but only have ${formattedBalance}.`;
        context.log(errorMsg);
        return createTaskResult(userAddress, 'failed', errorMsg);
      }

      context.log('Sufficient balances confirmed for both tokens.');
    } catch (readError) {
      const errorMsg = `Could not verify token balance due to a network error: ${(readError as Error).message}`;
      context.log(`Warning: Failed to read token balance.`, readError);
      return createTaskResult(userAddress, 'failed', errorMsg);
    }
    // --- Balance Check End is implicitly here ---

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

    const parsed = parseMcpToolResponsePayload(
      mcpResponse,
      z.object({
        chainId: z.string(),
        transactions: z.array(TransactionPlanSchema),
      })
    );
    const txPlan: TransactionPlan[] = parsed.transactions;

    // --- Construct Artifact Start ---
    const preview = {
      action: 'supply',
      pairHandle: selectedPair.handle,
      token0Symbol: selectedPair.symbol0,
      token0Amount: params.amount0,
      token1Symbol: selectedPair.symbol1,
      token1Amount: params.amount1,
      priceFrom: params.priceFrom,
      priceTo: params.priceTo,
    };
    const artifactContent: TransactionArtifact<typeof preview> = { txPlan, txPreview: preview };
    const dataPart: DataPart = {
      type: 'data',
      data: artifactContent as any,
    };

    return {
      id: context.userAddress || 'liquidity-agent-task',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Supply liquidity transaction plan prepared (${txPlan.length} txs). Please review and execute.`,
            },
          ],
        },
      },
      artifacts: [{ name: 'liquidity-transaction', parts: [dataPart] }],
    };
  } catch (error) {
    const errorMsg = `Error in handleSupplyLiquidity: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, 'failed', errorMsg);
  }
}

export async function handleWithdrawLiquidity(
  params: z.infer<typeof WithdrawLiquiditySchema>,
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
    const txPlan = parseMcpToolResponsePayload(
      mcpResponse,
      z.object({
        chainId: z.string(),
        transactions: z.array(TransactionPlanSchema),
      })
    ).transactions;

    context.log('Transaction plan for withdrawLiquidity:', txPlan);

    // --- Construct Artifact Start ---
    const previewW = {
      action: 'withdraw',
      positionNumber: params.positionNumber,
      pairHandle: selectedPosition.symbol0 + '/' + selectedPosition.symbol1,
      token0Symbol: selectedPosition.symbol0,
      token0Amount: selectedPosition.amount0,
      token1Symbol: selectedPosition.symbol1,
      token1Amount: selectedPosition.amount1,
    };
    const artifactContentW: TransactionArtifact<typeof previewW> = { txPlan, txPreview: previewW };
    const dataPartW: DataPart = {
      type: 'data',
      data: artifactContentW as any,
    };

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
      artifacts: [{ name: 'liquidity-transaction', parts: [dataPartW] }],
    };
  } catch (error) {
    const errorMsg = `Error in handleWithdrawLiquidity: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, 'failed', errorMsg);
  }
}
