import { z } from 'zod';
import { type VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import type { EmberContext, TokenInfo } from '../context/types.js';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import { SwapTokensResponseSchema, type SwapTokensResponse, type TransactionPlan } from 'ember-api';
import {
  parseUnits,
  formatUnits,
  createPublicClient,
  http,
  type Address,
  encodeFunctionData,
} from 'viem';
import { arbitrum } from 'viem/chains';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { composeBeforeHooks } from './hooks.js';
import { withHooks } from './withHooks.js';

// Tool parameter schema
const swapTokensParametersSchema = z.object({
  fromToken: z.string().describe('Source token symbol or name'),
  toToken: z.string().describe('Destination token symbol or name'),
  amount: z.string().describe('Amount to swap'),
  fromChain: z.string().describe('Source blockchain name').optional(),
  toChain: z.string().describe('Destination blockchain name').optional(),
});

type SwapTokensParams = z.infer<typeof swapTokensParametersSchema>;

// Swap transaction artifact type
export interface SwapTransactionArtifact {
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
}

// Chain mapping utilities
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

// Token resolution utility
function findTokensCaseInsensitive(
  tokenMap: Record<string, TokenInfo[]>,
  tokenName: string
): TokenInfo[] | undefined {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      return tokenMap[key];
    }
  }
  return undefined;
}

function findTokenDetail(
  tokenName: string,
  optionalChainName: string | undefined,
  tokenMap: Record<string, TokenInfo[]>,
  direction: 'from' | 'to'
): TokenInfo | string {
  const tokens = findTokensCaseInsensitive(tokenMap, tokenName);
  if (tokens === undefined) {
    throw new Error(`Token ${tokenName} not supported.`);
  }

  let tokenDetail: TokenInfo | undefined;

  if (optionalChainName) {
    const chainId = mapChainNameToId(optionalChainName);
    if (!chainId) {
      throw new Error(`Chain name ${optionalChainName} is not recognized.`);
    }
    tokenDetail = tokens?.find(token => token.chainId.toString() === chainId);
    if (!tokenDetail) {
      throw new Error(
        `Token ${tokenName} not supported on chain ${optionalChainName}. Available chains: ${tokens?.map(t => mapChainIdToName(t.chainId.toString())).join(', ')}`
      );
    }
  } else {
    if (!tokens || tokens.length === 0) {
      throw new Error(`Token ${tokenName} not supported.`);
    }
    if (tokens.length > 1) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.chainId.toString())}`)
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

// Base swap tool that calls Ember MCP server
const baseSwapTokensTool: VibkitToolDefinition<any, any, EmberContext> = {
  name: 'swap-tokens',
  description: 'Execute a token swap between two assets using DEX aggregation',
  parameters: swapTokensParametersSchema,
  execute: async (args: any, context) => {
    if (!context.custom.mcpClient) {
      throw new Error('MCP client not available');
    }

    console.log('[SwapTool] Calling Ember MCP server for token swap...');

    const swapResponse = await context.custom.mcpClient.callTool({
      name: 'swapTokens',
      arguments: {
        orderType: 'MARKET_SELL',
        baseToken: {
          chainId: args.fromTokenDetail.chainId.toString(),
          address: args.fromTokenDetail.address,
        },
        quoteToken: {
          chainId: args.toTokenDetail.chainId.toString(),
          address: args.toTokenDetail.address,
        },
        amount: args.atomicAmount.toString(),
        recipient: args.userAddress,
        slippageTolerance: '0.5',
      },
    });

    console.log('[SwapTool] Received response from Ember MCP server');
    return swapResponse;
  },
};

// Token resolution hook
const resolveTokensHook = async (
  args: SwapTokensParams,
  context: any
): Promise<SwapTokensParams | Task> => {
  console.log('[TokenResolution] Resolving tokens for swap...');

  const { fromToken: rawFromToken, toToken: rawToToken, amount, fromChain, toChain } = args;
  const userAddress = context.skillInput?.userAddress || context.custom.userAddress;

  if (!userAddress) {
    return {
      id: 'token-resolution',
      contextId: `swap-user-address-error-${Date.now()}`,
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
              text: 'User address not set. Please provide a wallet address.',
            },
          ],
        },
      },
    };
  }

  try {
    // Retrieve all possible token variants first so we can attempt smart chain inference
    const fromTokenVariants = findTokensCaseInsensitive(context.custom.tokenMap, rawFromToken);
    const toTokenVariants = findTokensCaseInsensitive(context.custom.tokenMap, rawToToken);

    if (!fromTokenVariants) {
      throw new Error(`Token ${rawFromToken} not supported.`);
    }
    if (!toTokenVariants) {
      throw new Error(`Token ${rawToToken} not supported.`);
    }

    // Helper to normalise chain input
    const normaliseChain = (chainName?: string): string | undefined => {
      return chainName ? mapChainNameToId(chainName) : undefined;
    };

    // Attempt to determine a single chain to use when the user has not explicitly provided both
    const explicitFromChainId = normaliseChain(fromChain);
    const explicitToChainId = normaliseChain(toChain);

    let inferredChainId: string | undefined;

    if (explicitFromChainId) {
      inferredChainId = explicitFromChainId;
    } else if (explicitToChainId) {
      inferredChainId = explicitToChainId;
    } else {
      // No explicit chain provided – attempt to infer a single common chain
      const fromChains = new Set(fromTokenVariants.map(t => t.chainId.toString()));
      const toChains = new Set(toTokenVariants.map(t => t.chainId.toString()));
      const intersection = [...fromChains].filter(id => toChains.has(id));
      if (intersection.length > 0) {
        // Prefer Arbitrum (42161) if it's a common chain, otherwise pick the first deterministic option
        inferredChainId = intersection.includes('42161') ? '42161' : intersection[0];
      }
    }

    // Helper that picks token detail for a given chain ID or falls back to findTokenDetail for clarification handling
    const pickTokenDetail = (
      tokenName: string,
      chainName: string | undefined,
      direction: 'from' | 'to'
    ): TokenInfo | string => {
      // If we already know target chain, just find the token on that chain.
      if (inferredChainId) {
        const candidates = findTokensCaseInsensitive(context.custom.tokenMap, tokenName);
        const match = candidates?.find(t => t.chainId.toString() === inferredChainId);
        if (match) return match;
        // fallthrough to existing behaviour if not found
      }
      return findTokenDetail(tokenName, chainName, context.custom.tokenMap, direction);
    };

    // Resolve from token (may return clarification string)
    const fromTokenResult = pickTokenDetail(rawFromToken, fromChain, 'from');
    if (typeof fromTokenResult === 'string') {
      return {
        id: userAddress,
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

    // Resolve to token (may return clarification string)
    const toTokenResult = pickTokenDetail(rawToToken, toChain, 'to');
    if (typeof toTokenResult === 'string') {
      return {
        id: userAddress,
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

    const fromTokenDetail = fromTokenResult;
    const toTokenDetail = toTokenResult;
    const atomicAmount = parseUnits(amount, fromTokenDetail.decimals);

    console.log(
      `[TokenResolution] Resolved: ${rawFromToken} -> ${fromTokenDetail.address}, ${rawToToken} -> ${toTokenDetail.address} on chain ${inferredChainId ?? 'unknown'}`
    );

    // Add resolved data to args for next hooks and base tool
    return {
      ...args,
      fromTokenDetail,
      toTokenDetail,
      atomicAmount,
      userAddress,
    } as any;
  } catch (error) {
    console.error('[TokenResolution] Error resolving tokens:', error);
    return {
      id: userAddress,
      contextId: `swap-token-resolution-error-${Date.now()}`,
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
};

// Balance checking hook
const checkBalanceHook = async (args: any, context: any): Promise<any | Task> => {
  console.log('[BalanceCheck] Verifying user balance...');

  const { fromTokenDetail, atomicAmount, userAddress, amount, fromToken } = args;

  try {
    // Create RPC client for balance check
    const publicClient = createPublicClient({
      chain: arbitrum, // Assuming Arbitrum for now - could be made dynamic
      transport: http(context.custom.config.arbitrumRpcUrl),
    });

    const currentBalance = (await publicClient.readContract({
      address: fromTokenDetail.address as Address,
      abi: Erc20Abi.abi,
      functionName: 'balanceOf',
      args: [userAddress],
    })) as bigint;

    console.log(`[BalanceCheck] User balance: ${currentBalance}, required: ${atomicAmount}`);

    if (currentBalance < atomicAmount) {
      const formattedBalance = formatUnits(currentBalance, fromTokenDetail.decimals);
      console.log(`[BalanceCheck] Insufficient balance: needs ${amount}, has ${formattedBalance}`);

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

    console.log('[BalanceCheck] Sufficient balance confirmed');
    return args;
  } catch (error) {
    console.error('[BalanceCheck] Error checking balance:', error);
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
              text: `Could not verify your balance due to a network error. Please try again.`,
            },
          ],
        },
      },
    };
  }
};

// Response formatting hook
const formatSwapResponseHook = async (rawResponse: any, context: any, args: any): Promise<Task> => {
  console.log('[ResponseFormat] Formatting swap response...');

  const { userAddress, fromToken, toToken, amount, fromTokenDetail, atomicAmount } =
    args;

  try {
    // Parse and validate MCP response
    const validatedSwapResponse: SwapTokensResponse = parseMcpToolResponsePayload(
      rawResponse,
      SwapTokensResponseSchema
    );

    const rawSwapTransactions = validatedSwapResponse.transactions;

    if (rawSwapTransactions.length === 0) {
      console.error('[ResponseFormat] Empty transaction plan received');
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
      console.error('[ResponseFormat] Invalid transaction structure');
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

    // Check if approval is needed
    const spenderAddress = firstSwapTx.to as Address;
    console.log(`[ResponseFormat] Checking approval for spender: ${spenderAddress}`);

    let approveTxResponse: TransactionPlan | undefined;
    try {
      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: http(context.custom.config.arbitrumRpcUrl),
      });

      const currentAllowance = (await publicClient.readContract({
        address: fromTokenDetail.address as Address,
        abi: Erc20Abi.abi,
        functionName: 'allowance',
        args: [userAddress, spenderAddress],
      })) as bigint;

      if (currentAllowance < atomicAmount) {
        console.log('[ResponseFormat] Creating approval transaction');
        approveTxResponse = {
          to: fromTokenDetail.address,
          data: encodeFunctionData({
            abi: Erc20Abi.abi,
            functionName: 'approve',
            args: [spenderAddress, BigInt(2) ** BigInt(256) - BigInt(1)],
          }),
          value: '0',
          chainId: fromTokenDetail.chainId.toString(),
          type: '0x2',
        };
      }
    } catch (error) {
      console.warn('[ResponseFormat] Could not check allowance, including approval tx');
      approveTxResponse = {
        to: fromTokenDetail.address,
        data: encodeFunctionData({
          abi: Erc20Abi.abi,
          functionName: 'approve',
          args: [spenderAddress, BigInt(2) ** BigInt(256) - BigInt(1)],
        }),
        value: '0',
        chainId: fromTokenDetail.chainId.toString(),
        type: '0x2',
      };
    }

    const finalTxPlan: TransactionPlan[] = [
      ...(approveTxResponse ? [approveTxResponse] : []),
      ...rawSwapTransactions,
    ];

    const txArtifact: SwapTransactionArtifact = {
      txPreview: {
        fromTokenSymbol: fromToken.toUpperCase(),
        fromTokenAddress: validatedSwapResponse.baseToken.address,
        fromTokenAmount: validatedSwapResponse.estimation?.baseTokenDelta || amount,
        fromChain: validatedSwapResponse.baseToken.chainId,
        toTokenSymbol: toToken.toUpperCase(),
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

    console.log('[ResponseFormat] Swap response formatted successfully');

    return {
      id: userAddress,
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
              text: `Transaction plan created for swapping ${amount} ${fromToken.toUpperCase()} to ${toToken.toUpperCase()}. Ready to sign.`,
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
  } catch (error) {
    console.error('[ResponseFormat] Error formatting response:', error);
    return {
      id: userAddress,
      contextId: `swap-formatting-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: `Error preparing swap: ${(error as Error).message}` }],
        },
      },
    };
  }
};

// Compose the complete swap tool with hooks
export const swapTokensTool = withHooks(baseSwapTokensTool, {
  before: composeBeforeHooks(resolveTokensHook, checkBalanceHook),
  after: formatSwapResponseHook,
});
