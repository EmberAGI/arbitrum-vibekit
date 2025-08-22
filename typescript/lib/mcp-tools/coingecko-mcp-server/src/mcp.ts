import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import pRetry, { AbortError } from 'p-retry';

// Retry configuration for rate limiting
const RETRY_CONFIG = {
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 60000,
    randomize: true,
};

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

// Check if error is a rate limit error (429) or other retryable errors
function isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    // Check for rate limiting (429) or server errors (5xx)
    return error.message.includes('status=429') || 
           error.message.includes('status=500') ||
           error.message.includes('status=502') ||
           error.message.includes('status=503') ||
           error.message.includes('status=504');
}

async function fetchChartDataWithRetry(tokenId: string, days: number) {
    return pRetry(
        async () => {
            try {
                const response = await fetch(
                    `https://api.coingecko.com/api/v3/coins/${tokenId}/market_chart?vs_currency=usd&days=${days}`
                );
                
                if (!response.ok) {
                    const error = new Error(`CoinGecko API request failed with status ${response.status}`);
                    (error as any).status = response.status;
                    throw error;
                }
                
                return await response.json();
            } catch (error) {
                if (isRetryableError(error)) {
                    console.error(`Rate limit or server error hit, retrying... Error: ${error}`);
                    throw error; // This will trigger a retry
                }
                // For non-retryable errors, don't retry
                throw new AbortError(error as Error);
            }
        },
        {
            ...RETRY_CONFIG,
            onFailedAttempt: (error) => {
                console.error(
                    `fetchChartData attempt ${error.attemptNumber} failed (${error.retriesLeft} retries left): ${error.message}`
                );
            },
        }
    );
}

export async function createServer() {
    const server = new McpServer({
        name: 'coingecko-mcp-server',
        version: '1.0.0'
    });

    //
    // Tool definitions
    //

    const GenerateChartSchema = z.object({
        token: z.string().describe('The symbol of the token, e.g., BTC, ETH.'),
        days: z.number().int().min(1).max(365).describe('The number of days of historical data to chart (1-365).'),
    });

    server.tool(
        'generate_chart',
        'Generate a price chart for a cryptocurrency over a specified number of days using CoinGecko API.',
        GenerateChartSchema.shape,
        async ({ token, days }) => {
            try {
                const tokenId = tokenMap[token.toUpperCase()];
                if (!tokenId) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({ 
                                    error: `Token "${token}" is not supported. Supported tokens: ${Object.keys(tokenMap).join(', ')}` 
                                }, null, 2),
                            },
                        ],
                    };
                }

                console.error(`🔍 [MCP] Fetching chart data for ${token} (${tokenId}) over ${days} days`);
                
                const data = await fetchChartDataWithRetry(tokenId, days) as any;
                console.error('🔍 [MCP] Chart data received:', data.prices?.length || 0, 'data points');

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ 
                                prices: data.prices,
                                token: token.toUpperCase(),
                                tokenId: tokenId,
                                days: days,
                                timestamp: new Date().toISOString()
                            }, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ 
                                error: `Failed to fetch chart data: ${(error as Error).message}` 
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    const GetSupportedTokensSchema = z.object({});

    server.tool(
        'get_supported_tokens',
        'Get a list of all supported cryptocurrency tokens and their symbols.',
        GetSupportedTokensSchema.shape,
        async () => {
            try {
                const supportedTokens = Object.entries(tokenMap).map(([symbol, id]) => ({
                    symbol,
                    id,
                    name: id.charAt(0).toUpperCase() + id.slice(1).replace('-', ' ')
                }));

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ 
                                supportedTokens,
                                count: supportedTokens.length,
                                timestamp: new Date().toISOString()
                            }, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ 
                                error: `Failed to get supported tokens: ${(error as Error).message}` 
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    return server;
} 