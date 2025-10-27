import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import {
  type SwapTokensRequest,
  type TransactionPlan,
  SwapTokensResponseSchema,
  SwapTokensRequestSchema,
  type Token,
} from 'ember-api';
import { z } from 'zod';

// Define TransactionArtifact locally since it's not exported from ember-api
export type TransactionArtifact<T> = {
  txPreview: T;
  txPlan: Array<TransactionPlan>;
};

// Input schema compatible with old SwapTokensArgs
export const SwapTokensArgsSchema = z.object({
  fromToken: z.string().describe('The symbol or address of the token to swap from.'),
  toToken: z.string().describe('The symbol or address of the token to swap to.'),
  amount: z.string().describe('The human-readable amount of the token to swap from.'),
  fromChain: z.string().optional().describe('Optional chain name/ID for the source token.'),
  toChain: z.string().optional().describe('Optional chain name/ID for the destination token.'),
});
export type SwapTokensArgs = z.infer<typeof SwapTokensArgsSchema>;

// Preview schema for pendle swaps
export const PendleSwapPreviewSchema = z.object({
  fromTokenName: z.string(),
  toTokenName: z.string(),
  humanReadableAmount: z.string(),
  chainName: z.string(),
  parsedChainId: z.string(),
});
export type PendleSwapPreview = z.infer<typeof PendleSwapPreviewSchema>;

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, Token[]>;
  userAddress: string;
  executeAction: (actionName: string, transactions: TransactionPlan[]) => Promise<string>;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

function findTokensCaseInsensitive(tokenMap: Record<string, Token[]>, tokenName: string): Token[] {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      const tokens = tokenMap[key];
      if (tokens) {
        return tokens;
      }
    }
  }
  return [];
}

const chainMappings = [
  { id: '1', name: 'Ethereum', aliases: ['mainnet'] },
  { id: '42161', name: 'Arbitrum One', aliases: ['arbitrum'] },
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

function findTokenDetail(
  tokenName: string,
  optionalChainName: string | undefined,
  tokenMap: Record<string, Token[]>
): Token | string {
  const tokens = findTokensCaseInsensitive(tokenMap, tokenName);
  if (tokens.length === 0) {
    throw new Error(`Token ${tokenName} not supported.`);
  }

  let tokenDetail: Token | undefined;

  if (optionalChainName) {
    const chainId = mapChainNameToId(optionalChainName);
    if (!chainId) {
      throw new Error(`Chain name ${optionalChainName} is not recognized.`);
    }
    tokenDetail = tokens.find(token => token.tokenUid.chainId === chainId);
    if (!tokenDetail) {
      throw new Error(
        `Token ${tokenName} not supported on chain ${optionalChainName}. Available chains: ${tokens.map(t => mapChainIdToName(t.tokenUid.chainId)).join(', ')}`
      );
    }
  } else {
    if (tokens.length > 1) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.tokenUid.chainId)}`)
        .join('\n');
      return `Multiple chains supported for ${tokenName}:\n${chainList}\nPlease specify the 'chain' parameter.`;
    }
    tokenDetail = tokens[0];
  }

  if (!tokenDetail) {
    throw new Error(
      `Could not resolve token details for ${tokenName} ${optionalChainName ? 'on chain ' + optionalChainName : ''}.`
    );
  }

  return tokenDetail;
}

export async function handleSwapTokens(
  params: SwapTokensArgs,
  context: HandlerContext
): Promise<Task> {
  const { fromToken, toToken, amount, fromChain, toChain } = params;

  let effectiveChainName: string | undefined = fromChain;
  if (fromChain && toChain && fromChain !== toChain) {
    return {
      id: context.userAddress,
      contextId: `swap-chain-mismatch-${Date.now()}`,
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
              text: 'Pendle swaps must occur on a single chain. fromChain and toChain must match if both are provided.',
            },
          ],
        },
      },
      artifacts: [],
    };
  }
  if (!effectiveChainName && toChain) {
    effectiveChainName = toChain;
  }

  const fromTokenResult = findTokenDetail(fromToken, effectiveChainName, context.tokenMap);
  if (typeof fromTokenResult === 'string') {
    return {
      id: context.userAddress,
      contextId: `swap-from-token-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: fromTokenResult }],
        },
      },
      artifacts: [],
    };
  }

  const toTokenChainName = toChain || mapChainIdToName(fromTokenResult.tokenUid.chainId);
  if (
    effectiveChainName &&
    toTokenChainName.toLowerCase() !== effectiveChainName.toLowerCase() &&
    toChain
  ) {
    // Chain mismatch detected but this is handled later in the cross-chain validation
    // No immediate action needed here
  } else if (!effectiveChainName) {
    effectiveChainName = mapChainIdToName(fromTokenResult.tokenUid.chainId);
  }

  const toTokenResult = findTokenDetail(toToken, toTokenChainName, context.tokenMap);
  if (typeof toTokenResult === 'string') {
    return {
      id: context.userAddress,
      contextId: `swap-to-token-error-${Date.now()}`,
      kind: 'task',
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          messageId: `msg-${Date.now()}`,
          kind: 'message',
          parts: [{ kind: 'text', text: toTokenResult }],
        },
      },
      artifacts: [],
    };
  }

  if (fromTokenResult.tokenUid.chainId !== toTokenResult.tokenUid.chainId) {
    return {
      id: context.userAddress,
      contextId: `swap-cross-chain-error-${Date.now()}`,
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
              text: `Cannot swap tokens across different chains. From token chain: ${mapChainIdToName(fromTokenResult.tokenUid.chainId)}, To token chain: ${mapChainIdToName(toTokenResult.tokenUid.chainId)}.`,
            },
          ],
        },
      },
      artifacts: [],
    };
  }

  // Build SwapTokensRequest object and validate with schema
  const swapRequest: SwapTokensRequest = {
    orderType: 'MARKET_BUY', // Let backend interpret buy/sell direction
    baseToken: {
      chainId: fromTokenResult.tokenUid.chainId,
      address: fromTokenResult.tokenUid.address,
    },
    quoteToken: {
      chainId: toTokenResult.tokenUid.chainId,
      address: toTokenResult.tokenUid.address,
    },
    amount,
    recipient: context.userAddress,
    slippageTolerance: '1',
  };

  // Log the exact request we are about to send to the backend
  context.log('[handleSwapTokens] swapRequest →', JSON.stringify(swapRequest, null, 2));

  // Ensure the request is compliant with the source-of-truth schema
  SwapTokensRequestSchema.parse(swapRequest);

  const mcpResponse = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: swapRequest,
  });

  // Log the raw MCP response for debugging purposes
  context.log('[handleSwapTokens] raw mcpResponse ←', JSON.stringify(mcpResponse, null, 2));

  // Parse and validate tool response with the new schema
  const parsedData = parseMcpToolResponsePayload(mcpResponse, SwapTokensResponseSchema);
  context.log('[handleSwapTokens] parsed swapTokens result', JSON.stringify(parsedData, null, 2));

  const { chainId, transactions } = parsedData;

  const preview: PendleSwapPreview = {
    fromTokenName: fromToken,
    toTokenName: toToken,
    humanReadableAmount: amount,
    chainName: effectiveChainName || mapChainIdToName(fromTokenResult.tokenUid.chainId),
    parsedChainId: chainId,
  };

  const artifactContent: TransactionArtifact<PendleSwapPreview> = {
    txPreview: preview,
    txPlan: transactions,
  };

  const artifact = {
    artifactId: `swap-transaction-${Date.now()}`,
    name: 'swap-transaction-plan',
    parts: [
      {
        kind: 'data' as const,
        data: artifactContent,
      },
    ],
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
            text: `Swap transaction plan prepared (${transactions.length} txs). Please review and execute.`,
          },
        ],
      },
    },
    artifacts: [artifact],
  };
}
