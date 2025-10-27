import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { streamText, type LanguageModelV1 } from 'ai';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import {
  SwapTokensResponseSchema,
  type SwapTokensResponse,
  type TransactionPlan,
  type Token,
} from 'ember-api';
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
  tokenMap: Record<string, Token[]>;
  userAddress: string | undefined;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
  openRouterApiKey?: string;
  camelotContextContent: string;
  provider: (model?: string) => LanguageModelV1;
}

function findTokensCaseInsensitive(
  tokenMap: Record<string, Token[]>,
  tokenName: string
): Token[] | undefined {
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

function mapChainIdToName(chainId: string): string {
  const found = chainMappings.find(mapping => mapping.id === chainId);
  return found?.name || chainId;
}

// Environment variable overrides for RPC URLs per chainId.
// If set, these will be preferred over QuickNode for read-only operations in tests/dev.
const RPC_ENV_VAR_BY_CHAIN_ID: Record<string, string> = {
  '1': 'ETHEREUM_RPC_URL',
  '10': 'OPTIMISM_RPC_URL',
  '137': 'POLYGON_RPC_URL',
  '42161': 'ARBITRUM_ONE_RPC_URL',
  '421614': 'ARBITRUM_SEPOLIA_RPC_URL',
  '8453': 'BASE_CHAIN_RPC_URL',
  '33139': 'APECHAIN_RPC_URL',
  '33111': 'APECHAIN_CURTIS_RPC_URL',
};

function findTokenDetail(
  tokenName: string,
  optionalChainName: string | undefined,
  tokenMap: Record<string, Token[]>,
  direction: 'from' | 'to'
): Token | string {
  const tokens = findTokensCaseInsensitive(tokenMap, tokenName);
  if (tokens === undefined) {
    throw new Error(`Token ${tokenName} not supported.`);
  }

  let tokenDetail: Token | undefined;

  if (optionalChainName) {
    const chainId = mapChainNameToId(optionalChainName);
    if (!chainId) {
      throw new Error(`Chain name ${optionalChainName} is not recognized.`);
    }
    tokenDetail = tokens?.find(token => token.tokenUid.chainId === chainId);
    if (!tokenDetail) {
      throw new Error(
        `Token ${tokenName} not supported on chain ${optionalChainName}. Available chains: ${tokens?.map(t => mapChainIdToName(t.tokenUid.chainId)).join(', ')}`
      );
    }
  } else {
    if (!tokens || tokens.length === 0) {
      throw new Error(`Token ${tokenName} not supported.`);
    }
    if (tokens.length > 1) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.tokenUid.chainId)}`)
        .join('\n');
      return `Multiple chains supported for ${tokenName}:\n${chainList}\nPlease specify the '${direction}Chain'.`;
    }
    tokenDetail = tokens[0];
  }

  if (!tokenDetail) {
    throw new Error(
      `Could not resolve token details for ${tokenName}${optionalChainName ? ' on chain ' + optionalChainName : ''}.`
    );
  }

  return tokenDetail;
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
      contextId: `swap-from-token-clarification-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.InputRequired,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: fromTokenResult }],
        },
      },
    };
  }
  const fromTokenDetail = fromTokenResult;

  const toTokenResult = findTokenDetail(rawToToken, toChain, context.tokenMap, 'to');
  if (typeof toTokenResult === 'string') {
    return {
      id: context.userAddress,
      contextId: `swap-to-token-clarification-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.InputRequired,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: toTokenResult }],
        },
      },
    };
  }
  const toTokenDetail = toTokenResult;

  const atomicAmount = parseUnits(amount, fromTokenDetail.decimals);
  const txChainId = fromTokenDetail.tokenUid.chainId;
  const fromTokenAddress = fromTokenDetail.tokenUid.address as Address;
  const userAddress = context.userAddress as Address;

  context.log(
    `Preparing swap: ${rawFromToken} (${fromTokenAddress} on chain ${txChainId}) to ${rawToToken} (${toTokenDetail.tokenUid.address} on chain ${toTokenDetail.tokenUid.chainId}), Amount: ${amount} (${atomicAmount}), User: ${userAddress}`
  );

  let publicClient: PublicClient;
  try {
    const chainConfig = getChainConfigById(txChainId);
    const networkSegment = chainConfig.quicknodeSegment;
    const targetChain = chainConfig.viemChain;
    const overrideEnvVar = RPC_ENV_VAR_BY_CHAIN_ID[txChainId];
    const overrideRpcUrl = overrideEnvVar ? process.env[overrideEnvVar] : undefined;

    let dynamicRpcUrl: string;
    if (overrideRpcUrl) {
      dynamicRpcUrl = overrideRpcUrl;
      publicClient = createPublicClient({
        chain: targetChain,
        transport: http(dynamicRpcUrl),
      });
      context.log(`Public client created for chain ${txChainId} via override ${overrideEnvVar}`);
    } else {
      if (networkSegment === '') {
        dynamicRpcUrl = `https://${context.quicknodeSubdomain}.quiknode.pro/${context.quicknodeApiKey}`;
      } else {
        dynamicRpcUrl = `https://${context.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${context.quicknodeApiKey}`;
      }
      publicClient = createPublicClient({
        chain: targetChain,
        transport: http(dynamicRpcUrl),
      });
      context.log(
        `Public client created for chain ${txChainId} via ${dynamicRpcUrl.split('/')[2]}`
      );
    }
  } catch (chainError) {
    context.log(`Failed to create public client for chain ${txChainId}:`, chainError);
    return {
      id: userAddress,
      contextId: `swap-chain-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: `Network configuration error for chain ${txChainId}.` }],
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
      const formattedBalance = formatUnits(currentBalance, fromTokenDetail.decimals);
      context.log(`Insufficient balance for the swap. Needs ${amount}, has ${formattedBalance}`);
      return {
        id: userAddress,
        contextId: `swap-insufficient-balance-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
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
      contextId: `swap-balance-check-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Could not verify your ${fromToken} balance due to a network error. Please try again.`,
            },
          ],
        },
      },
    };
  }

  context.log(
    `Executing swap via MCP: ${fromToken} (address: ${fromTokenDetail.tokenUid.address}, chain: ${fromTokenDetail.tokenUid.chainId}) to ${toToken} (address: ${toTokenDetail.tokenUid.address}, chain: ${toTokenDetail.tokenUid.chainId}), amount: ${amount}, atomicAmount: ${atomicAmount}, userAddress: ${context.userAddress}`
  );

  const swapResponseRaw = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: {
      orderType: 'MARKET_SELL',
      baseToken: {
        chainId: fromTokenDetail.tokenUid.chainId,
        address: fromTokenDetail.tokenUid.address,
      },
      quoteToken: {
        chainId: toTokenDetail.tokenUid.chainId,
        address: toTokenDetail.tokenUid.address,
      },
      amount: atomicAmount.toString(),
      recipient: context.userAddress,
      slippageTolerance: '0.5',
    },
  });

  let validatedSwapResponse: SwapTokensResponse;
  try {
    validatedSwapResponse = parseMcpToolResponsePayload(swapResponseRaw, SwapTokensResponseSchema);
  } catch (error) {
    context.log('MCP tool swapTokens returned invalid data structure:', error);
    return {
      id: userAddress,
      contextId: `swap-mcp-parse-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: (error as Error).message }],
        },
      },
    };
  }
  const rawSwapTransactions = validatedSwapResponse.transactions;

  if (rawSwapTransactions.length === 0) {
    context.log('Invalid or empty transaction plan received from MCP tool:', rawSwapTransactions);
    return {
      id: userAddress,
      contextId: `swap-empty-plan-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: 'Swap service returned an empty transaction plan.' }],
        },
      },
    };
  }

  const firstSwapTx = rawSwapTransactions[0] as TransactionPlan;
  if (!firstSwapTx || typeof firstSwapTx !== 'object' || !('to' in firstSwapTx)) {
    context.log('Invalid swap transaction object received from MCP:', firstSwapTx);
    return {
      id: userAddress,
      contextId: `swap-invalid-tx-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
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
      to: fromTokenAddress,
      data: encodeFunctionData({
        abi: Erc20Abi.abi,
        functionName: 'approve',
        args: [spenderAddress, BigInt(2) ** BigInt(256) - BigInt(1)],
      }),
      value: '0',
      chainId: txChainId,
      type: '0x2',
    };
  } else {
    context.log('Sufficient allowance already exists.');
  }

  context.log('Validating the swap transactions received from MCP tool...');
  const validatedSwapTxPlan: TransactionPlan[] = rawSwapTransactions;

  const finalTxPlan: TransactionPlan[] = [
    ...(approveTxResponse ? [approveTxResponse] : []),
    ...validatedSwapTxPlan,
  ];

  const txArtifact: SwapTransactionArtifact = {
    txPreview: {
      fromTokenSymbol: fromToken,
      fromTokenAddress: validatedSwapResponse.baseToken.address,
      fromTokenAmount: validatedSwapResponse.estimation?.baseTokenDelta || amount,
      fromChain: validatedSwapResponse.baseToken.chainId,
      toTokenSymbol: toToken,
      toTokenAddress: validatedSwapResponse.quoteToken.address,
      toTokenAmount: validatedSwapResponse.estimation?.quoteTokenDelta || '0',
      toChain: validatedSwapResponse.quoteToken.chainId,
      exchangeRate: validatedSwapResponse.estimation?.effectivePrice || '0',
      executionTime: validatedSwapResponse.estimation?.timeEstimate,
      expiration: validatedSwapResponse.estimation?.expiration,
      explorerUrl: validatedSwapResponse.providerTracking?.explorerUrl,
    },
    txPlan: finalTxPlan,
  };

  return {
    id: context.userAddress,
    contextId: `swap-success-${Date.now()}`,
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
            text: `Transaction plan created for swapping ${amount} ${fromToken} to ${toToken}. Ready to sign.`,
          },
        ],
      },
    },
    artifacts: [
      {
        artifactId: `swap-transaction-${Date.now()}`,
        name: 'transaction-plan',
        parts: [
          {
            kind: 'data',
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
  const { userAddress, openRouterApiKey, log, camelotContextContent } = context;

  if (!userAddress) {
    throw new Error('User address not set!');
  }
  if (!openRouterApiKey) {
    log('Error: OpenRouter API key is not configured in HandlerContext.');
    return {
      id: userAddress,
      contextId: `encyclopedia-config-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: 'The Camelot expert tool is not configured correctly (Missing API Key). Please contact support.',
            },
          ],
        },
      },
    };
  }

  log(`Handling askEncyclopedia for user ${userAddress} with question: "${question}"`);

  try {
    if (!camelotContextContent.trim()) {
      log('Error: Camelot context documentation provided by the agent is empty.');
      return {
        id: userAddress,
        contextId: `encyclopedia-content-error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              {
                kind: 'text',
                text: 'Could not load the necessary Camelot documentation to answer your question.',
              },
            ],
          },
        },
      };
    }

    const systemPrompt = `You are a Camelot DEX expert. The following information is your own knowledge and expertise - do not refer to it as provided, given, or external information. Speak confidently in the first person as the expert you are.

Do not say phrases like "Based on my knowledge" or "According to the information". Instead, simply state the facts directly as an expert would.

If you don't know something, simply say "I don't know" or "I don't have information about that" without apologizing or referring to limited information.

${camelotContextContent}`;

    log('Calling AI model...');
    const { textStream } = await streamText({
      model: context.provider(),
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
      contextId: `encyclopedia-success-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: responseText }],
        },
      },
    };
  } catch (error: unknown) {
    log(`Error during askEncyclopedia execution:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return {
      id: userAddress,
      contextId: `encyclopedia-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: `Error asking Camelot expert: ${errorMessage}` }],
        },
      },
    };
  }
}

// Define the swap transaction artifact type
export type SwapTransactionArtifact = {
  txPreview: {
    fromTokenSymbol: string;
    fromTokenAddress: string;
    fromTokenAmount: string;
    fromChain: string;
    toTokenSymbol: string;
    toTokenAddress: string;
    toTokenAmount: string;
    toChain: string;
    exchangeRate: string;
    executionTime?: string;
    expiration?: string;
    explorerUrl?: string;
  };
  txPlan: TransactionPlan[];
};
