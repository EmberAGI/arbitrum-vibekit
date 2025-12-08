import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getSupportedTokens, TOKEN_MAPPINGS } from '../utils/tokenMapping.js';

export const listSupportedTokensTool: Tool = {
  name: 'list-supported-tokens',
  description: 'List all supported tokens with their names and search configurations. Useful for discovering available tokens.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function executeListSupportedTokens(_args: unknown): Promise<{ content: unknown }> {
  const tokens = getSupportedTokens();
  const tokenDetails = tokens.map((symbol) => {
    const info = TOKEN_MAPPINGS[symbol];
    if (!info) {
      return null;
    }
    return {
      symbol: info.symbol,
      name: info.name,
      searchTerms: info.searchTerms,
      hasSpecificSubreddits: (info.subreddits?.length ?? 0) > 0,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  const response = {
    totalTokens: tokens.length,
    tokens: tokenDetails,
    categories: {
      layer1: ['ETH', 'BTC'],
      layer2: ['ARB', 'OP', 'MATIC'],
      defi: ['UNI', 'AAVE', 'LINK', 'GMX', 'CRV', 'MKR', 'SNX', 'COMP'],
      stablecoins: ['USDC', 'USDT', 'DAI'],
    },
    meta: {
      generatedAt: new Date().toISOString(),
      notes: 'These tokens have optimized search configurations for better relevance. More tokens can be added on request.',
    },
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

