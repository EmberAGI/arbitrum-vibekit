import { type Address } from 'viem';
import { formatUnits, parseUnits, createPublicClient, http, PublicClient } from 'viem';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };

import { Task, TaskState, Artifact } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { LiquidityPosition, LiquidityPair, getChainConfigById } from './agent.js';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  GetLiquidityPoolsResponseSchema,
  GetWalletLiquidityPositionsResponseSchema,
  SupplyLiquidityResponseSchema,
  WithdrawLiquidityResponseSchema,
  type LiquidityPool,
  type TransactionPlan as EmberTransactionPlan,
} from 'ember-api';

export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

function createTaskResult(
  id: string | undefined,
  state: TaskState,
  message: string,
  artifacts?: Artifact[]
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
    artifacts,
  };
}

export async function handleGetLiquidityPools(
  _params: Record<string, never>,
  context: HandlerContext
): Promise<Task> {
  context.log('Handling getLiquidityPools...');

  // Ensure we have an MCP client available
  if (!context.mcpClient) {
    return createTaskResult(context.userAddress, TaskState.Failed, 'MCP client not available.');
  }

  try {
    const rawResult = await context.mcpClient.callTool({
      name: 'getLiquidityPools',
      arguments: {},
    });

    const response = parseMcpToolResponsePayload(rawResult, GetLiquidityPoolsResponseSchema);
    const liquidityPools = response.liquidityPools || [];

    // Convert to local LiquidityPair format and cache
    const pairs: LiquidityPair[] = liquidityPools.map((pool: LiquidityPool) => ({
      handle: `${pool.symbol0}/${pool.symbol1}`,
      token0: { chainId: pool.token0.chainId, address: pool.token0.address, symbol: pool.symbol0 },
      token1: { chainId: pool.token1.chainId, address: pool.token1.address, symbol: pool.symbol1 },
    }));
    context.updatePairs(pairs);

    if (liquidityPools.length === 0) {
      return createTaskResult(
        context.userAddress,
        TaskState.Completed,
        'No liquidity pools available.'
      );
    }

    let responseText = 'Available Liquidity Pools:\n';
    liquidityPools.forEach((pool: LiquidityPool) => {
      responseText += `- ${pool.symbol0}/${pool.symbol1} (Price: ${pool.price})\n`;
    });

    return createTaskResult(context.userAddress, TaskState.Completed, responseText, [
      {
        artifactId: `pools-${Date.now()}`,
        name: 'available-liquidity-pools',
        parts: [{ kind: 'data', data: response }],
      },
    ]);
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

  if (!context.mcpClient) {
    return createTaskResult(undefined, TaskState.Failed, 'MCP client not available in context.');
  }

  try {
    const rawResult = await context.mcpClient.callTool({
      name: 'getWalletLiquidityPositions',
      arguments: {
        walletAddress: context.userAddress,
      },
    });

    const response = parseMcpToolResponsePayload(
      rawResult,
      GetWalletLiquidityPositionsResponseSchema
    );
    const positions = response.positions || [];
    context.updatePositions(positions);
    context.log(`Updated internal state with ${positions.length} positions.`);

    if (positions.length === 0) {
      return createTaskResult(
        context.userAddress,
        TaskState.Completed,
        'No liquidity positions found.'
      );
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

    return createTaskResult(context.userAddress, TaskState.Completed, responseText, [
      {
        artifactId: `positions-${Date.now()}`,
        name: 'wallet-positions',
        parts: [{ kind: 'data', data: response }],
      },
    ]);
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
    const selectedPair = pairs.find((p: LiquidityPair) => p.handle === params.pair);

    if (!selectedPair) {
      return createTaskResult(
        userAddress,
        TaskState.Failed,
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
      return createTaskResult(userAddress, TaskState.Failed, errorMsg);
    }

    // Fetch Decimals
    let decimals0: number;
    let decimals1: number;
    try {
      context.log(`Fetching decimals for ${selectedPair.token0.symbol}...`);
      decimals0 = (await client0.readContract({
        address: token0.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'decimals',
        args: [],
      })) as number;
      context.log(`Decimals for ${selectedPair.token0.symbol}: ${decimals0}`);

      context.log(`Fetching decimals for ${selectedPair.token1.symbol}...`);
      decimals1 =
        token0.address === token1.address && token0.chainId === token1.chainId
          ? decimals0 // Avoid refetching if same token/chain
          : ((await client1.readContract({
              address: token1.address as Address,
              abi: Erc20Abi.abi,
              functionName: 'decimals',
              args: [],
            })) as number);
      context.log(`Decimals for ${selectedPair.token1.symbol}: ${decimals1}`);

      // Basic validation
      if (typeof decimals0 !== 'number' || typeof decimals1 !== 'number') {
        throw new Error('Failed to retrieve valid decimal numbers for tokens.');
      }
    } catch (fetchError) {
      const errorMsg = `Could not fetch token decimals: ${(fetchError as Error).message}`;
      context.log('Error:', errorMsg);
      // Add which token failed if possible
      return createTaskResult(userAddress, TaskState.Failed, errorMsg);
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
      return createTaskResult(userAddress, TaskState.Failed, errorMsg);
    }

    // Check balances using fetched decimals
    try {
      const balance0 = (await client0.readContract({
        address: token0.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      })) as bigint;
      context.log(
        `Balance check ${selectedPair.token0.symbol}: Has ${balance0}, needs ${amount0Atomic}`
      );

      if (balance0 < amount0Atomic) {
        const formattedBalance = formatUnits(balance0, decimals0);
        const errorMsg = `Insufficient ${selectedPair.token0.symbol} balance. You need ${params.amount0} but only have ${formattedBalance}.`;
        context.log(errorMsg);
        return createTaskResult(userAddress, TaskState.Failed, errorMsg);
      }

      const balance1 = (await client1.readContract({
        address: token1.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      })) as bigint;
      context.log(
        `Balance check ${selectedPair.token1.symbol}: Has ${balance1}, needs ${amount1Atomic}`
      );

      if (balance1 < amount1Atomic) {
        const formattedBalance = formatUnits(balance1, decimals1);
        const errorMsg = `Insufficient ${selectedPair.token1.symbol} balance. You need ${params.amount1} but only have ${formattedBalance}.`;
        context.log(errorMsg);
        return createTaskResult(userAddress, TaskState.Failed, errorMsg);
      }

      context.log('Sufficient balances confirmed for both tokens.');
    } catch (readError) {
      const errorMsg = `Could not verify token balance due to a network error: ${(readError as Error).message}`;
      context.log(`Warning: Failed to read token balance.`, readError);
      return createTaskResult(userAddress, TaskState.Failed, errorMsg);
    }
    // --- Balance Check End is implicitly here ---

    const supplyRequest = {
      token0: {
        chainId: selectedPair.token0.chainId,
        address: selectedPair.token0.address,
      },
      token1: {
        chainId: selectedPair.token1.chainId,
        address: selectedPair.token1.address,
      },
      amount0: params.amount0,
      amount1: params.amount1,
      range: {
        type: 'limited' as const,
        minPrice: params.priceFrom,
        maxPrice: params.priceTo,
      },
      walletAddress: userAddress,
    };
    context.log('Calling supplyLiquidity with args:', supplyRequest);

    if (!context.mcpClient) {
      return createTaskResult(userAddress, TaskState.Failed, 'MCP client not available.');
    }

    const rawResult = await context.mcpClient.callTool({
      name: 'supplyLiquidity',
      arguments: supplyRequest,
    });

    const response = parseMcpToolResponsePayload(rawResult, SupplyLiquidityResponseSchema);
    const txPlan: TransactionPlan[] = response.transactions.map((tx: EmberTransactionPlan) => ({
      ...tx,
      chainId: response.chainId,
    }));

    return createTaskResult(
      context.userAddress,
      TaskState.Completed,
      `Supply liquidity transaction plan prepared (${response.transactions.length} txs).`,
      [
        {
          artifactId: `supply-transaction-${Date.now()}`,
          name: 'liquidity-transaction',
          parts: [{ kind: 'data', data: { txPlan } }],
        },
      ]
    );
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
    const positions = context.getPositions();
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

    if (!context.mcpClient) {
      return createTaskResult(context.userAddress, TaskState.Failed, 'MCP client not available.');
    }

    const rawResult = await context.mcpClient.callTool({
      name: 'withdrawLiquidity',
      arguments: withdrawRequest,
    });

    const response = parseMcpToolResponsePayload(rawResult, WithdrawLiquidityResponseSchema);
    context.log('Transaction plan for withdrawLiquidity:', response.transactions);

    const txPlan: TransactionPlan[] = response.transactions.map((tx: EmberTransactionPlan) => ({
      ...tx,
      chainId: response.chainId,
    }));

    return createTaskResult(
      context.userAddress,
      TaskState.Completed,
      `Withdraw liquidity transaction plan prepared. Transactions: ${JSON.stringify(response.transactions, null, 2)}`,
      [
        {
          artifactId: `withdraw-transaction-${Date.now()}`,
          name: 'liquidity-transaction',
          parts: [{ kind: 'data', data: { txPlan } }],
        },
      ]
    );
  } catch (error) {
    const errorMsg = `Error in handleWithdrawLiquidity: ${error instanceof Error ? error.message : String(error)}`;
    context.log(errorMsg);
    return createTaskResult(context.userAddress, TaskState.Failed, errorMsg);
  }
}

// Local minimal TransactionPlan interface (avoids ember-api dependency)
interface TransactionPlan {
  to: string;
  data: string;
  value?: string;
  chainId?: string;
}

// Local HandlerContext interface (mirrors context provided by agent)
export interface HandlerContext {
  userAddress: string | undefined;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
  log: (...args: unknown[]) => void;
  getPairs: () => LiquidityPair[];
  updatePairs: (pairs: LiquidityPair[]) => void;
  getPositions: () => LiquidityPosition[];
  updatePositions: (positions: LiquidityPosition[]) => void;
  emberClient?: unknown; // Optional ember client
  mcpClient?: Client; // To satisfy Agent getHandlerContext typing
}
