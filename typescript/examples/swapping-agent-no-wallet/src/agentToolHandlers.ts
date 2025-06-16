import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };
import type { Task } from 'a2a-samples-js';
import { streamText } from 'ai';
import { type TransactionArtifact, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import {
  SwapResponseSchema,
  TransactionPlansSchema,
  type SwapResponse,
  type SwapPreview,
  type TransactionPlan,
  type TokenIdentifier,
} from 'ember-schemas';
import {
  parseUnits,
  createPublicClient,
  http,
  type Address,
  encodeFunctionData,
  type PublicClient,
  formatUnits,
} from 'viem';

import { getChainConfigById } from './agent.js';

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, TokenIdentifier[]>;
  userAddress: string | undefined;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
  openRouterApiKey: string;
  swappingContextContent: string;
}

async function getTokenDecimals(
  tokenAddress: Address,
  chainId: string,
  context: HandlerContext
): Promise<number> {
  try {
    const chainConfig = getChainConfigById(chainId);
    const networkSegment = chainConfig.quicknodeSegment;
    let dynamicRpcUrl: string;
    if (networkSegment === '') {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.quiknode.pro/${context.quicknodeApiKey}`;
    } else {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${context.quicknodeApiKey}`;
    }
    
    const publicClient = createPublicClient({
      chain: chainConfig.viemChain,
      transport: http(dynamicRpcUrl),
    });

    const decimals = (await publicClient.readContract({
      address: tokenAddress,
      abi: Erc20Abi.abi,
      functionName: 'decimals',
    })) as number;

    return decimals;
  } catch (error) {
    context.log(`Failed to fetch decimals for token ${tokenAddress} on chain ${chainId}. Error: ${(error as Error).message}`);
    throw new Error(`Could not fetch decimals for token ${tokenAddress} on chain ${chainId}: ${(error as Error).message}`);
  }
}

function findTokensCaseInsensitive(
  tokenMap: Record<string, TokenIdentifier[]>,
  tokenName: string
): TokenIdentifier[] | undefined {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      return tokenMap[key];
    }
  }
  return undefined;
}

const chainMappings = [
  { id: '1', name: 'Ethereum', aliases: ['mainnet'] },
  { id: '42161', name: 'Arbitrum', aliases: [] },
  { id: '10', name: 'Optimism', aliases: [] },
  { id: '137', name: 'Polygon', aliases: ['matic'] },
  { id: '8453', name: 'Base', aliases: [] },
];

function mapChainNameToId(chainName: string): string | undefined {
  const normalized = chainName.toLowerCase();
  const found = chainMappings.find(
    mapping => mapping.name.toLowerCase() === normalized || mapping.aliases.includes(normalized)
  );
  return found?.id;
}

function findTokenDetail(
  tokenName: string,
  optionalChainName: string | undefined,
  tokenMap: Record<string, TokenIdentifier[]>,
  _direction: 'from' | 'to'
): TokenIdentifier | string {
  const tokens = findTokensCaseInsensitive(tokenMap, tokenName);
  if (tokens === undefined) {
    throw new Error(`Token ${tokenName} not supported.`);
  }

  let tokenIdentifier: TokenIdentifier | undefined;

  if (optionalChainName) {
    const chainId = mapChainNameToId(optionalChainName);
    if (!chainId) {
      throw new Error(`Chain name ${optionalChainName} is not recognized.`);
    }
    tokenIdentifier = tokens?.find(token => token.chainId === chainId);
    if (!tokenIdentifier) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. Chain ${t.chainId}`)
        .join(', ');
      throw new Error(
        `Token ${tokenName} not supported on chain ${optionalChainName} (chainId: ${chainId}). Available chains: ${chainList}`
      );
    }
  } else {
    if (!tokens || tokens.length === 0) {
      throw new Error(`Token ${tokenName} not supported.`);
    }
    if (tokens.length > 1) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. Chain ${t.chainId}`)
        .join(', ');
      return `Multiple chains available for ${tokenName}. Please specify: ${chainList}`;
    }
    tokenIdentifier = tokens[0];
  }

  if (!tokenIdentifier) {
    throw new Error(`Token ${tokenName} not found.`);
  }

  return tokenIdentifier;
}

export async function handleSwapTokens(
  params: {
    fromToken: string;
    toToken: string;
    amount: string;
    fromChain?: string;
    toChain?: string;
  },
  context: HandlerContext
): Promise<Task> {
  const { fromToken: rawFromToken, toToken: rawToToken, amount, fromChain, toChain } = params;
  const fromToken = rawFromToken.toUpperCase();
  const toToken = rawToToken.toUpperCase();

  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const fromTokenResult = findTokenDetail(rawFromToken, fromChain, context.tokenMap, 'from');
  if (typeof fromTokenResult === 'string') {
    return {
      id: context.userAddress,
      status: {
        state: 'input-required',
        message: { role: 'agent', parts: [{ type: 'text', text: fromTokenResult }] },
      },
    };
  }
  const fromTokenIdentifier = fromTokenResult;

  const toTokenResult = findTokenDetail(rawToToken, toChain, context.tokenMap, 'to');
  if (typeof toTokenResult === 'string') {
    return {
      id: context.userAddress,
      status: {
        state: 'input-required',
        message: { role: 'agent', parts: [{ type: 'text', text: toTokenResult }] },
      },
    };
  }
  const toTokenIdentifier = toTokenResult;

  const fromTokenDecimals = await getTokenDecimals(fromTokenIdentifier.address as Address, fromTokenIdentifier.chainId, context);
  const atomicAmount = parseUnits(amount, fromTokenDecimals);
  const txChainId = fromTokenIdentifier.chainId;
  const fromTokenAddress = fromTokenIdentifier.address as Address;
  const userAddress = context.userAddress as Address;

  context.log(
    `Preparing swap: ${rawFromToken} (${fromTokenAddress} on chain ${txChainId}) to ${rawToToken} (${toTokenIdentifier.address} on chain ${toTokenIdentifier.chainId}), Amount: ${amount} (${atomicAmount}), User: ${userAddress}`
  );

  let publicClient: PublicClient;
  try {
    const chainConfig = getChainConfigById(txChainId);
    const networkSegment = chainConfig.quicknodeSegment;
    const targetChain = chainConfig.viemChain;
    let dynamicRpcUrl: string;
    if (networkSegment === '') {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.quiknode.pro/${context.quicknodeApiKey}`;
    } else {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${context.quicknodeApiKey}`;
    }
    publicClient = createPublicClient({
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });
    context.log(`Public client created for chain ${txChainId} via ${dynamicRpcUrl.split('/')[2]}`);
  } catch (chainError) {
    context.log(`Failed to create public client for chain ${txChainId}:`, chainError);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Network configuration error for chain ${txChainId}.` }],
        },
      },
    };
  }

  let currentBalance: bigint;
  try {
    currentBalance = (await publicClient.readContract({
      address: fromTokenAddress,
      abi: Erc20Abi.abi,
      functionName: 'balanceOf',
      args: [userAddress],
    })) as bigint;
    context.log(`User balance check: Has ${currentBalance}, needs ${atomicAmount} of ${fromToken}`);

    if (currentBalance < atomicAmount) {
      const formattedBalance = formatUnits(currentBalance, fromTokenDecimals);
      context.log(`Insufficient balance for the swap. Needs ${amount}, has ${formattedBalance}`);
      return {
        id: userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Insufficient ${fromToken} balance. You need ${amount} but only have ${formattedBalance}.`,
              },
            ],
          },
        },
      };
    }
    context.log(`Sufficient balance confirmed.`);
  } catch (readError) {
    context.log(`Warning: Failed to read token balance. Error: ${(readError as Error).message}`);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Could not verify your ${fromToken} balance due to a network error. Please try again.`,
            },
          ],
        },
      },
    };
  }

  context.log(
    `Executing swap via MCP: ${fromToken} (address: ${fromTokenIdentifier.address}, chain: ${fromTokenIdentifier.chainId}) to ${toToken} (address: ${toTokenIdentifier.address}, chain: ${toTokenIdentifier.chainId}), amount: ${amount}, atomicAmount: ${atomicAmount}, userAddress: ${context.userAddress}`
  );

  const swapResponseRaw = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: {
      fromTokenAddress: fromTokenIdentifier.address,
      fromTokenChainId: fromTokenIdentifier.chainId,
      toTokenAddress: toTokenIdentifier.address,
      toTokenChainId: toTokenIdentifier.chainId,
      amount: atomicAmount.toString(),
      userAddress: context.userAddress,
    },
  });

  let validatedSwapResponse: SwapResponse;
  try {
    validatedSwapResponse = parseMcpToolResponsePayload(swapResponseRaw, SwapResponseSchema);
  } catch (error) {
    context.log('MCP tool swapTokens returned invalid data structure:', error);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: (error as Error).message }],
        },
      },
    };
  }
  const rawSwapTransactions = validatedSwapResponse.transactions;

  if (rawSwapTransactions.length === 0) {
    context.log('Invalid or empty transaction plan received from MCP tool:', rawSwapTransactions);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Swap service returned an empty transaction plan.' }],
        },
      },
    };
  }

  const firstSwapTx = rawSwapTransactions[0] as TransactionPlan;
  if (!firstSwapTx || typeof firstSwapTx !== 'object' || !('to' in firstSwapTx)) {
    context.log('Invalid swap transaction object received from MCP:', firstSwapTx);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: 'Swap service returned an invalid transaction structure.',
            },
          ],
        },
      },
    };
  }
  const spenderAddress = (firstSwapTx as TransactionPlan).to as Address;

  context.log(
    `Checking allowance: User ${userAddress} needs to allow Spender ${spenderAddress} to spend ${atomicAmount} of Token ${fromTokenAddress} on Chain ${txChainId}`
  );

  let currentAllowance: bigint = 0n;
  try {
    currentAllowance = (await publicClient.readContract({
      address: fromTokenAddress,
      abi: Erc20Abi.abi,
      functionName: 'allowance',
      args: [userAddress, spenderAddress],
    })) as bigint;
    context.log(`Successfully read allowance: ${currentAllowance}. Required: ${atomicAmount}`);
  } catch (readError) {
    context.log(
      `Warning: Failed to read allowance via readContract. Error: ${(readError as Error).message}`
    );
    context.log('Assuming allowance is insufficient due to check failure.');
  }

  let approveTxResponse: TransactionPlan | undefined;
  if (currentAllowance < atomicAmount) {
    context.log(
      `Insufficient allowance or check failed. Need ${atomicAmount}, have ${currentAllowance}. Preparing approval transaction...`
    );
    approveTxResponse = {
      type: 'approval' as const,
      to: fromTokenAddress,
      data: encodeFunctionData({
        abi: Erc20Abi.abi,
        functionName: 'approve',
        args: [spenderAddress, BigInt(2) ** BigInt(256) - BigInt(1)],
      }),
      value: '0',
    };
  } else {
    context.log('Sufficient allowance already exists.');
  }

  context.log('Validating the swap transactions received from MCP tool...');
  const validatedSwapTxPlan: TransactionPlan[] = TransactionPlansSchema.parse(rawSwapTransactions);

  const finalTxPlan: TransactionPlan[] = [
    ...(approveTxResponse ? [approveTxResponse] : []),
    ...validatedSwapTxPlan,
  ];

  const txArtifact: SwapTransactionArtifact = {
    txPreview: {
      fromTokenSymbol: fromToken,
      fromTokenAddress: validatedSwapResponse.baseToken.address,
      fromTokenAmount: validatedSwapResponse.estimation.baseTokenDelta,
      fromChain: validatedSwapResponse.baseToken.chainId,
      toTokenSymbol: toToken,
      toTokenAddress: validatedSwapResponse.quoteToken.address,
      toTokenAmount: validatedSwapResponse.estimation.quoteTokenDelta,
      toChain: validatedSwapResponse.quoteToken.chainId,
      exchangeRate: validatedSwapResponse.estimation.effectivePrice,
      executionTime: validatedSwapResponse.estimation.timeEstimate,
      expiration: validatedSwapResponse.estimation.expiration,
      explorerUrl: validatedSwapResponse.providerTracking.explorerUrl,
    },
    txPlan: finalTxPlan,
  };

  return {
    id: context.userAddress,
    status: {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [
          {
            type: 'text',
            text: `Transaction plan created for swapping ${amount} ${fromToken} to ${toToken}. Ready to sign.`,
          },
        ],
      },
    },
    artifacts: [
      {
        name: 'transaction-plan',
        parts: [
          {
            type: 'data',
            data: { ...txArtifact },
          },
        ],
      },
    ],
  };
}

export async function handleAskEncyclopedia(
  params: { question: string },
  context: HandlerContext
): Promise<Task> {
  const { question } = params;
  const { userAddress, openRouterApiKey, log, swappingContextContent } = context;

  if (!userAddress) {
    throw new Error('User address not set!');
  }
  if (!openRouterApiKey) {
    log('Error: OpenRouter API key is not configured in HandlerContext.');
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: 'The Camelot expert tool is not configured correctly (Missing API Key). Please contact support.',
            },
          ],
        },
      },
    };
  }

  log(`Handling askEncyclopedia for user ${userAddress} with question: "${question}"`);

  try {
    if (!swappingContextContent.trim()) {
      log('Error: Camelot context documentation provided by the agent is empty.');
      return {
        id: userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: 'Could not load the necessary Camelot documentation to answer your question.',
              },
            ],
          },
        },
      };
    }

    const openrouter = createOpenRouter({
      apiKey: openRouterApiKey,
    });

    const systemPrompt = `You are a Camelot DEX expert. The following information is your own knowledge and expertise - do not refer to it as provided, given, or external information. Speak confidently in the first person as the expert you are.

Do not say phrases like "Based on my knowledge" or "According to the information". Instead, simply state the facts directly as an expert would.

If you don't know something, simply say "I don't know" or "I don't have information about that" without apologizing or referring to limited information.

${swappingContextContent}`;

    log('Calling OpenRouter model...');
    const { textStream } = await streamText({
      model: openrouter('google/gemini-2.5-flash-preview'),
      system: systemPrompt,
      prompt: question,
    });

    let responseText = '';
    for await (const textPart of textStream) {
      responseText += textPart;
    }

    log(`Received response from OpenRouter: ${responseText}`);

    return {
      id: userAddress,
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: responseText }],
        },
      },
    };
  } catch (error: unknown) {
    log(`Error during askEncyclopedia execution:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Error asking Camelot expert: ${errorMessage}` }],
        },
      },
    };
  }
}

export type SwapTransactionArtifact = TransactionArtifact<SwapPreview>;
