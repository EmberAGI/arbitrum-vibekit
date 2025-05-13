import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { SwapTokensArgs } from './agent.js';
import type { Task, Artifact, DataPart } from 'a2a-samples-js';
import {
  parseMcpToolResponse as sharedParseMcpToolResponse,
  createTransactionArtifactSchema,
  type TransactionArtifact,
} from 'arbitrum-vibekit';
import {
  validateTransactionPlans,
  type TransactionPlan,
  TransactionPlanSchema,
} from 'ember-mcp-tool-server';

export type TokenInfo = {
  chainId: string;
  address: string;
};

// Define swap schema to match the MCP tool server
export const SwapTokensParamsSchema = z.object({
  fromTokenAddress: z.string().describe('The contract address of the token to swap from.'),
  fromTokenChainId: z.string().describe('The chain ID where the fromToken contract resides.'),
  toTokenAddress: z.string().describe('The contract address of the token to swap to.'),
  toTokenChainId: z.string().describe('The chain ID where the toToken contract resides.'),
  amount: z
    .string()
    .describe('The amount of the fromToken to swap (atomic, non-human readable format).'),
  userAddress: z.string().describe('The wallet address initiating the swap.'),
});

export type SwapTokensParams = z.infer<typeof SwapTokensParamsSchema>;

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

// Define a Zod schema for the transaction preview specific to Pendle swaps
const PendleSwapPreviewSchema = z.object({
  fromTokenName: z.string(),
  toTokenName: z.string(),
  humanReadableAmount: z.string(),
  chainName: z.string(),
  parsedChainId: z.string(),
});

// Define the type for the Pendle swap preview
type PendleSwapPreview = z.infer<typeof PendleSwapPreviewSchema>;

// Define the schema for the artifact content using the shared utility
const PendleSwapArtifactSchema = createTransactionArtifactSchema(PendleSwapPreviewSchema);

// Schema to validate swapTokens tool response
const SwapResponseSchema = z.object({
  chainId: z.string(),
  transactions: z.array(TransactionPlanSchema),
});

export async function handleSwapTokens(
  params: SwapTokensArgs,
  context: HandlerContext
): Promise<Task> {
  const { fromTokenName, toTokenName, humanReadableAmount, chainName } = params;

  // Get from token details and handle possible string response
  const fromTokenResult = findTokenDetail(fromTokenName, chainName, context.tokenMap);
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

  // Determine effective chain for to token lookup
  const effectiveChain = chainName || mapChainIdToName(fromTokenResult.chainId);

  // Get to token details and handle possible string response
  const toTokenResult = findTokenDetail(toTokenName, effectiveChain, context.tokenMap);
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

  // Assert that tokens are on the same chain
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
              text: `Cannot swap tokens across different chains. From chain: ${fromTokenResult.chainId}, To chain: ${toTokenResult.chainId}`,
            },
          ],
        },
      },
      artifacts: [],
    };
  }

  // Create properly typed swap params directly
  const swapParams: SwapTokensParams = {
    fromTokenAddress: fromTokenResult.address,
    fromTokenChainId: fromTokenResult.chainId,
    toTokenAddress: toTokenResult.address,
    toTokenChainId: toTokenResult.chainId,
    amount: humanReadableAmount,
    userAddress: context.userAddress,
  };

  const mcpResponse = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: swapParams,
  });

  // Parse and validate tool response with Zod
  const parsedData = sharedParseMcpToolResponse(mcpResponse, SwapResponseSchema);
  const { chainId, transactions } = parsedData;
  const txs: TransactionPlan[] = validateTransactionPlans(transactions);

  const preview: PendleSwapPreview = {
    fromTokenName,
    toTokenName,
    humanReadableAmount,
    chainName: effectiveChain,
    parsedChainId: chainId,
  };

  const artifactContent: TransactionArtifact<PendleSwapPreview> = {
    txPlan: txs,
    txPreview: preview,
  };

  const dataPart: DataPart = {
    type: 'data',
    data: artifactContent as any,
  };

  // Construct and return a Task artifact
  return {
    id: context.userAddress,
    status: {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [
          {
            type: 'text',
            text: `Swap transaction plan prepared (${txs.length} txs). Please review and execute.`,
          },
        ],
      },
    },
    artifacts: [
      {
        name: 'swap-yield-transaction',
        parts: [dataPart],
      } as Artifact,
    ],
  };
}
