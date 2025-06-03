import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { type Task, type Artifact, type DataPart } from 'a2a-samples-js';
import { parseMcpToolResponsePayload, type TransactionArtifact } from 'arbitrum-vibekit-core';
import { TransactionPlansSchema } from 'ember-schemas';
import {
  type SwapTokensArgs,
  type SwapTokensParams,
  type PendleSwapPreview,
  type TransactionPlan,
} from 'ember-schemas';
import { z } from 'zod';

export type TokenInfo = {
  chainId: string;
  address: string;
};

// Schema to validate swapTokens tool response
const SwapResponseSchema = z.object({
  chainId: z.string(),
  transactions: TransactionPlansSchema,
});

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, TokenInfo[]>;
  userAddress: string;
  executeAction: (actionName: string, transactions: TransactionPlan[]) => Promise<string>;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

function findTokensCaseInsensitive(
  tokenMap: Record<string, TokenInfo[]>,
  tokenName: string
): TokenInfo[] {
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
  tokenMap: Record<string, TokenInfo[]>
): TokenInfo | string {
  const tokens = findTokensCaseInsensitive(tokenMap, tokenName);
  if (tokens.length === 0) {
    throw new Error(`Token ${tokenName} not supported.`);
  }

  let tokenDetail: TokenInfo | undefined;

  if (optionalChainName) {
    const chainId = mapChainNameToId(optionalChainName);
    if (!chainId) {
      throw new Error(`Chain name ${optionalChainName} is not recognized.`);
    }
    tokenDetail = tokens.find(token => token.chainId === chainId);
    if (!tokenDetail) {
      throw new Error(
        `Token ${tokenName} not supported on chain ${optionalChainName}. Available chains: ${tokens.map(t => mapChainIdToName(t.chainId)).join(', ')}`
      );
    }
  } else {
    if (tokens.length > 1) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.chainId)}`)
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
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
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
      status: {
        state: 'failed',
        message: { role: 'agent', parts: [{ type: 'text', text: fromTokenResult }] },
      },
      artifacts: [],
    };
  }

  const toTokenChainName = toChain || mapChainIdToName(fromTokenResult.chainId);
  if (
    effectiveChainName &&
    toTokenChainName.toLowerCase() !== effectiveChainName.toLowerCase() &&
    toChain
  ) {
    // Chain mismatch detected but this is handled later in the cross-chain validation
    // No immediate action needed here
  } else if (!effectiveChainName) {
    effectiveChainName = mapChainIdToName(fromTokenResult.chainId);
  }

  const toTokenResult = findTokenDetail(toToken, toTokenChainName, context.tokenMap);
  if (typeof toTokenResult === 'string') {
    return {
      id: context.userAddress,
      status: {
        state: 'failed',
        message: { role: 'agent', parts: [{ type: 'text', text: toTokenResult }] },
      },
      artifacts: [],
    };
  }

  if (fromTokenResult.chainId !== toTokenResult.chainId) {
    return {
      id: context.userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Cannot swap tokens across different chains. From token chain: ${mapChainIdToName(fromTokenResult.chainId)}, To token chain: ${mapChainIdToName(toTokenResult.chainId)}.`,
            },
          ],
        },
      },
      artifacts: [],
    };
  }

  const swapParamsForMcp: SwapTokensParams = {
    fromTokenAddress: fromTokenResult.address,
    fromTokenChainId: fromTokenResult.chainId,
    toTokenAddress: toTokenResult.address,
    toTokenChainId: toTokenResult.chainId,
    amount: amount,
    userAddress: context.userAddress,
  };

  const mcpResponse = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: swapParamsForMcp,
  });

  // Parse and validate tool response with Zod
  const parsedData = parseMcpToolResponsePayload(mcpResponse, SwapResponseSchema);
  const { chainId, transactions } = parsedData;

  const preview: PendleSwapPreview = {
    fromTokenName: fromToken,
    toTokenName: toToken,
    humanReadableAmount: amount,
    chainName: effectiveChainName || mapChainIdToName(fromTokenResult.chainId),
    parsedChainId: chainId,
  };

  const artifactContent: TransactionArtifact<PendleSwapPreview> = {
    txPlan: transactions,
    txPreview: preview,
  };

  const dataPart: DataPart = {
    type: 'data',
    data: { ...artifactContent },
  };

  const artifact: Artifact = {
    name: 'swap-transaction-plan',
    parts: [dataPart],
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
            text: `Swap transaction plan prepared (${transactions.length} txs). Please review and execute.`,
          },
        ],
      },
    },
    artifacts: [artifact],
  };
}
