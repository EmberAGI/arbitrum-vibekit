import { type Address } from 'viem';
import { formatUnits, parseUnits, createPublicClient, http, PublicClient } from 'viem';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };

import { Task, TaskState } from '@google-a2a/types/src/types.js';
import { LiquidityPosition, LiquidityPair, getChainConfigById } from './agent.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';

// Response schemas for MCP tools
const GetLiquidityPoolsResponseSchema = z.object({
  liquidityPools: z.array(z.object({
    symbol0: z.string(),
    symbol1: z.string(),
    price: z.string(),
    token0: z.object({
      chainId: z.string(),
      address: z.string(),
    }),
    token1: z.object({
      chainId: z.string(),
      address: z.string(),
    }),
  })),
});

const GetWalletLiquidityPositionsResponseSchema = z.object({
  positions: z.array(z.any()), // Using any for now since we have the LiquidityPosition interface
});

const SupplyLiquidityResponseSchema = z.object({
  transactions: z.array(z.any()),
});

const WithdrawLiquidityResponseSchema = z.object({
  transactions: z.array(z.any()),
});

export interface HandlerContext {
  mcpClient: Client;
  userAddress: string | undefined;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
  log: (...args: unknown[]) => void;
  getPairs: () => LiquidityPair[];
  updatePairs: (pairs: LiquidityPair[]) => void;
  getPositions: () => LiquidityPosition[];
  updatePositions: (positions: LiquidityPosition[]) => void;
}

function createTaskResult(
  id: string | undefined,
  state: TaskState,
  message: string,
  artifacts?: any[]
): Task {
  return {
    id: id || 'liquidity-agent-task',
    contextId: `task-${Date.now()}`,
    kind: 'task',
    status: {
      state,
      message: {
        role: 'agent',
        messageId: `msg-${Date.now()}`,
        kind: 'message',
        parts: [{ kind: 'text', text: message }],
      },
    },
    artifacts: artifacts || [],
  };
}
export async function handleGetLiquidityPools(
  _params: Record<string, never>,
  context: HandlerContext
): Promise<Task> {
  context.log('Handling getLiquidityPools...');
  try {
    const rawResult = await context.mcpClient.callTool({
      name: 'getLiquidityPools',
      arguments: {},
    });

    const response = parseMcpToolResponsePayload(rawResult, GetLiquidityPoolsResponseSchema);
    const liquidityPools = response.liquidityPools || [];
    
    // Update internal pairs state
    const pairs: LiquidityPair[] = liquidityPools.map((pool: any) => ({
      handle: `${pool.symbol0}/${pool.symbol1}`,
      token0: {
        chainId: pool.token0.chainId,
        address: pool.token0.address,
        symbol: pool.symbol0,
      },
      token1: {
        chainId: pool.token1.chainId,
        address: pool.token1.address,
        symbol: pool.symbol1,
      },
    }));
    
    context.updatePairs(pairs);

    if (liquidityPools.length === 0) {
      return createTaskResult(context.userAddress, TaskState.Completed, 'No liquidity pools available.');
    }

    let responseText = 'Available Liquidity Pools:\n';
    liquidityPools.forEach((pool: any) => {
      responseText += `- ${pool.symbol0}/${pool.symbol1} (Price: ${pool.price})\n`;
    });

    return createTaskResult(context.userAddress, TaskState.Completed, responseText);
  } catch (error) {
    const errorMsg = `Error in handleGetLiquidityPools: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, TaskState.Failed, errorMsg);
  }
}

export async function handleGetWalletLiquidityPositions(
  _params: Record<string, never>,
  context: HandlerContext
): Promise<Task> {
  context.log('Handling getWalletLiquidityPositions...');
  if (!context.userAddress) {
    return createTaskResult(undefined, TaskState.Failed, 'User address not available in context.');
  }

  try {
    const rawResult = await context.mcpClient.callTool({
      name: 'getWalletLiquidityPositions',
      arguments: {
        walletAddress: context.userAddress,
      },
    });

    const response = parseMcpToolResponsePayload(rawResult, GetWalletLiquidityPositionsResponseSchema);
    const positions = response.positions || [];
    context.updatePositions(positions);
    context.log(`Updated internal state with ${positions.length} positions.`);

    if (positions.length === 0) {
      return createTaskResult(context.userAddress, TaskState.Completed, 'No liquidity positions found.');
    }

    let responseText = 'Your Liquidity Positions:\n\n';
    positions.forEach((pos: LiquidityPosition, index: number) => {
      responseText += `${index + 1}: ${pos.symbol0}/${pos.symbol1}\n`;
      responseText += `  Amount0: ${pos.amount0} ${pos.symbol0}\n`;
      responseText += `  Amount1: ${pos.amount1} ${pos.symbol1}\n`;
      responseText += `  Price: ${pos.price}\n`;
      responseText += `  Price Range: ${
        pos.positionRange
          ? pos.positionRange.fromPrice + ' to ' + pos.positionRange.toPrice
          : '0 to ∞'
      }\n\n`;
    });

    return createTaskResult(context.userAddress, TaskState.Completed, responseText);
  } catch (error) {
    const errorMsg = `Error in handleGetWalletLiquidityPositions: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, TaskState.Failed, errorMsg);
  }
}

export async function handleSupplyLiquidity(
  params: {
    pair: string;
    amount0: string;
    amount1: string;
    priceFrom: string;
    priceTo: string;
  },
  context: HandlerContext
): Promise<Task> {
  context.log('Handling supplyLiquidity with params:', params);
  const userAddress = context.userAddress;
  if (!userAddress) {
    return createTaskResult(undefined, TaskState.Failed, 'User address not available in context.');
  }

  try {
    const pairs = context.getPairs();
    let selectedPair = pairs.find(p => p.handle === params.pair);

    // If pair not found in cache, try to fetch pools first
    if (!selectedPair) {
      await handleGetLiquidityPools({}, context);
      const updatedPairs = context.getPairs();
      selectedPair = updatedPairs.find(p => p.handle === params.pair);
    }

    if (!selectedPair) {
      return createTaskResult(
        userAddress,
        TaskState.Failed,
        `Liquidity pair handle "${params.pair}" not found or not supported.`
      );
    }

    // --- Basic Balance Check (Optional) ---
    context.log(`Checking balances for user ${userAddress} for pair ${selectedPair.handle}`);
    const { token0, token1 } = selectedPair;
    const { quicknodeSubdomain, quicknodeApiKey } = context;

    // Function to create client
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

    try {
      const client0 = createClient(token0.chainId);
      const client1 = token0.chainId === token1.chainId ? client0 : createClient(token1.chainId);

      // Get decimals
      const decimals0 = (await client0.readContract({
        address: token0.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'decimals',
        args: [],
      })) as number;

      const decimals1 = token0.address === token1.address && token0.chainId === token1.chainId
        ? decimals0
        : ((await client1.readContract({
            address: token1.address as Address,
            abi: Erc20Abi.abi,
            functionName: 'decimals',
            args: [],
          })) as number);

      // Parse amounts and check balances
      const amount0Atomic = parseUnits(params.amount0, decimals0);
      const amount1Atomic = parseUnits(params.amount1, decimals1);

      const balance0 = (await client0.readContract({
        address: token0.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      })) as bigint;

      const balance1 = (await client1.readContract({
        address: token1.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      })) as bigint;

      if (balance0 < amount0Atomic) {
        const formattedBalance = formatUnits(balance0, decimals0);
        return createTaskResult(userAddress, TaskState.Failed, 
          `Insufficient ${token0.symbol} balance. You need ${params.amount0} but only have ${formattedBalance}.`);
      }

      if (balance1 < amount1Atomic) {
        const formattedBalance = formatUnits(balance1, decimals1);
        return createTaskResult(userAddress, TaskState.Failed, 
          `Insufficient ${token1.symbol} balance. You need ${params.amount1} but only have ${formattedBalance}.`);
      }

      context.log('Sufficient balances confirmed for both tokens.');
    } catch (balanceError) {
      context.log('Warning: Failed to check balances:', balanceError);
      // Continue anyway - the onchain-actions will do the final validation
    }

    // Call the MCP tool
    const supplyRequest = {
      token0: {
        chainId: token0.chainId,
        address: token0.address,
      },
      token1: {
        chainId: token1.chainId,
        address: token1.address,
      },
      amount0: params.amount0,
      amount1: params.amount1,
      range: {
        type: "limited",
        minPrice: params.priceFrom,
        maxPrice: params.priceTo,
      },
      walletAddress: userAddress,
    };

    context.log('Calling supplyLiquidity with args:', supplyRequest);
    const rawResult = await context.mcpClient.callTool({
      name: 'supplyLiquidity',
      arguments: supplyRequest,
    });

    const response = parseMcpToolResponsePayload(rawResult, SupplyLiquidityResponseSchema);

    // Create task response with transaction plan
    return {
      id: userAddress,
      contextId: `supply-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Supply liquidity transaction plan prepared (${response.transactions?.length || 0} txs).`,
            },
          ],
        },
      },
      artifacts: [{ 
        artifactId: `supply-transaction-${Date.now()}`,
        name: 'liquidity-transaction', 
        parts: [{ kind: 'data', data: response }] 
      }],
    };
  } catch (error) {
    const errorMsg = `Error in handleSupplyLiquidity: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, TaskState.Failed, errorMsg);
  }
}

export async function handleWithdrawLiquidity(
  params: {
    positionNumber: number;
  },
  context: HandlerContext
): Promise<Task> {
  context.log('Handling withdrawLiquidity with params:', params);
  if (!context.userAddress) {
    return createTaskResult(undefined, TaskState.Failed, 'User address not available in context.');
  }

  try {
    let positions = context.getPositions();
    
    // If no positions in cache, fetch them first
    if (positions.length === 0) {
      await handleGetWalletLiquidityPositions({}, context);
      positions = context.getPositions();
    }

    const positionIndex = params.positionNumber - 1;

    if (positionIndex < 0 || positionIndex >= positions.length) {
      return createTaskResult(
        context.userAddress,
        TaskState.Failed,
        `Invalid position number: ${params.positionNumber}. Please choose from 1 to ${positions.length}.`
      );
    }

    const selectedPosition = positions[positionIndex];
    if (!selectedPosition) {
      return createTaskResult(
        context.userAddress,
        TaskState.Failed,
        `Internal error: Position at index ${positionIndex} is unexpectedly undefined.`
      );
    }

    const withdrawRequest = {
      tokenId: selectedPosition.tokenId,
      providerId: selectedPosition.providerId,
      walletAddress: context.userAddress,
    };

    context.log('Calling withdrawLiquidity with args:', withdrawRequest);
    const rawResult = await context.mcpClient.callTool({
      name: 'withdrawLiquidity',
      arguments: withdrawRequest,
    });

    const response = parseMcpToolResponsePayload(rawResult, WithdrawLiquidityResponseSchema);

    // Create task response with transaction plan
    return {
      id: context.userAddress,
      contextId: `withdraw-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Withdraw liquidity transaction plan prepared (${response.transactions?.length || 0} txs).`,
            },
          ],
        },
      },
      artifacts: [{ 
        artifactId: `withdraw-transaction-${Date.now()}`,
        name: 'liquidity-transaction', 
        parts: [{ kind: 'data', data: response }] 
      }],
    };
  } catch (error) {
    const errorMsg = `Error in handleWithdrawLiquidity: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, TaskState.Failed, errorMsg);
  }
}
