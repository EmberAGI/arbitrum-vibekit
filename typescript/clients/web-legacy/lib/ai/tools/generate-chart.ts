import { tool } from 'ai';
import { z } from 'zod';

// Simple mapping from token symbols to CoinGecko API IDs
const tokenMap: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  WBTC: 'wrapped-bitcoin',
  WETH: 'weth',
  ARB: 'arbitrum',
  BASE: 'base',
  MATIC: 'matic-network', // Polygon
  OP: 'optimism', // Optimism
};

const parametersSchema = z.object({
  token: z.string().describe('The symbol of the token, e.g., BTC, ETH.'),
  days: z
    .number()
    .describe('The number of days of historical data to chart.'),
});

export const generateChart = tool({
  description:
    'Generate a price chart for a cryptocurrency over a specified number of days.',
  parameters: parametersSchema,
  // @ts-ignore - AI SDK v5 tool types have compatibility issues with parameter inference
  execute: async ({ token, days }: any) => {
    const tokenId = tokenMap[token.toUpperCase()];
    if (!tokenId) {
      return { error: `Token "${token}" is not supported.` };
    }

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${tokenId}/market_chart?vs_currency=usd&days=${days}`,
      );
      if (!response.ok) {
        throw new Error(
          `CoinGecko API request failed with status ${response.status}`,
        );
      }
      const data = await response.json();
      console.log('🔍 [TOOL] Chart data:', data.prices);

      // The data from CoinGecko is { prices: [[timestamp, price], ...], ... }
      // We can return this directly or process it first.
      // Let's return the prices array for the component to handle.
      return { prices: data.prices };
    } catch (error) {
      console.error('API route error:', error); // Log the error for debugging
      return { error: 'Failed to fetch chart data' }; // Return an appropriate error response
    }
  },
}) as any;
