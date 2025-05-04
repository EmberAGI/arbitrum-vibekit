import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ethers } from 'ethers';
import type { Task } from 'a2a-samples-js/schema';
import { GmxSdk } from '@gmx-io/sdk';
import { getMarketInfo } from './gmx/markets.js';
import { getPositionInfo } from './gmx/positions.js';
import { createSwapOrder } from './gmx/swap.js';

// Schema for GMX market information
const MarketInfoSchema = z.object({
  marketAddress: z.string().describe('The address of the GMX market'),
  marketName: z.string().describe('The name of the market (e.g., ETH/USD)'),
  indexToken: z.object({
    address: z.string().describe('The address of the index token'),
    symbol: z.string().describe('The symbol of the index token (e.g., ETH)'),
    decimals: z.number().describe('The number of decimals for the index token'),
  }),
  longToken: z.object({
    address: z.string().describe('The address of the long token'),
    symbol: z.string().describe('The symbol of the long token (e.g., ETH)'),
    decimals: z.number().describe('The number of decimals for the long token'),
  }),
  shortToken: z.object({
    address: z.string().describe('The address of the short token'),
    symbol: z.string().describe('The symbol of the short token (e.g., USDC)'),
    decimals: z.number().describe('The number of decimals for the short token'),
  }),
});

// Schema for position information
const PositionInfoSchema = z.object({
  account: z.string().describe('The account address for the position'),
  market: z.string().describe('The market name (e.g., ETH/USD)'),
  marketAddress: z.string().describe('The market address'),
  side: z.enum(['LONG', 'SHORT']).describe('Position side (LONG or SHORT)'),
  size: z.string().describe('Position size in USD'),
  collateral: z.string().describe('Collateral amount'),
  leverage: z.string().describe('Current leverage'),
  entryPrice: z.string().describe('Entry price'),
  markPrice: z.string().describe('Current mark price'),
  liquidationPrice: z.string().describe('Liquidation price'),
  pnl: z.string().describe('Current PnL (Profit and Loss)'),
  pnlPercentage: z.string().describe('PnL as a percentage'),
});

// Schema for creating a position
const CreatePositionSchema = z.object({
  marketAddress: z.string().describe('The market address to create a position in'),
  side: z.enum(['LONG', 'SHORT']).describe('Position side (LONG or SHORT)'),
  collateralTokenAddress: z.string().describe('The address of the collateral token'),
  collateralAmount: z.string().describe('The amount of collateral to use'),
  leverage: z.number().describe('The leverage to use for the position'),
  slippage: z.number().optional().describe('Allowed slippage in basis points (50 = 0.5%)'),
});

// Schema for decreasing a position
const DecreasePositionSchema = z.object({
  marketAddress: z.string().describe('The market address of the position to decrease'),
  collateralTokenAddress: z.string().describe('The address of the collateral token'),
  collateralAmount: z.string().describe('The amount of collateral to withdraw'),
  isClosePosition: z.boolean().describe('Whether to completely close the position'),
  slippage: z.number().optional().describe('Allowed slippage in basis points (50 = 0.5%)'),
});

// Schema for creating a swap order
const CreateSwapOrderSchema = z.object({
  // userAddress: z
  //   .string()
  //   .optional()
  //   .describe('Optional. User address starting with "0x". If not provided, will use the address from GMX client.'),
  fromToken: z.string().describe('The token to swap from'),
  toToken: z.string().describe('The token to swap to'),
  amount: z.string().describe('The amount of tokens to swap'),
  isLimit: z.boolean().optional().describe('Whether to use a limit order'),
  slippage: z.number().optional().describe('Allowed slippage in basis points (50 = 0.5%)'),
});

// Define types for the schemas
export type CreatePositionParams = z.infer<typeof CreatePositionSchema>;
export type DecreasePositionParams = z.infer<typeof DecreasePositionSchema>;
export type CreateSwapOrderParams = z.infer<typeof CreateSwapOrderSchema>;
// Define schemas for GMX agent handlers
export const GmxQuerySchema = z.object({
  instruction: z.string(),
  // userAddress: z
  //   .string()
  //   .optional()
  //   .describe('Optional. User address starting with "0x". If not provided, will use the address from GMX client.'),
});

export interface HandlerContext {
  gmxClient: GmxSdk;
  provider: ethers.providers.Provider;
  mcpClient: Client;
  log: (...args: unknown[]) => void;
}

/**
 * Parse MCP tool response to handle nested JSON content
 */
export function parseMcpToolResponse(
  rawResponse: unknown,
  context: HandlerContext,
  toolName: string,
): unknown {
  let dataToValidate: unknown;

  if (
    rawResponse &&
    typeof rawResponse === 'object' &&
    'content' in rawResponse &&
    Array.isArray((rawResponse as any).content) &&
    (rawResponse as any).content.length > 0 &&
    (rawResponse as any).content[0]?.type === 'text' &&
    typeof (rawResponse as any).content[0]?.text === 'string'
  ) {
    context.log(`Raw ${toolName} result appears nested, parsing inner text...`);
    try {
      const parsedData = JSON.parse((rawResponse as any).content[0].text);
      dataToValidate = parsedData;
    } catch (e) {
      context.log(`Error parsing inner text content from ${toolName} result:`, e);
      throw new Error(
        `Failed to parse nested JSON response from ${toolName}: ${(e as Error).message}`,
      );
    }
  } else {
    dataToValidate = rawResponse;
  }

  return dataToValidate;
}

/**
 * Handle markets query
 */
export async function handleMarketsQuery(
  args: { marketSymbol?: string },
  context: HandlerContext,
): Promise<Task> {
  try {
    console.log('Debug: getting market info');
    const marketInfo = await getMarketInfo(context.gmxClient);
    if (!marketInfo.success) {
      console.log(`Failed to fetch market information}`);
    }

    console.log('Debug: successfully got market info');

    // Filter token data if a symbol is provided
    let filteredTokensData = marketInfo.modifiedTokensData;
    let filteredMarketsInfoData = marketInfo.modifiedMarketsInfoData;
    let message = `Found ${marketInfo.totalMarketInfoCount} markets and ${marketInfo.totalTokenDataCount} tokens.`;

    if (args.marketSymbol) {
      const symbol = args.marketSymbol.toUpperCase();
      console.log('Debug: get market info for symbol: ', symbol);
      // Filter tokens by symbol
      filteredTokensData = Object.fromEntries(
        Object.entries(marketInfo.modifiedTokensData).filter(
          ([_, tokenData]) => (tokenData as any).symbol?.toUpperCase() === symbol,
        ),
      );

      // Filter markets containing the token
      filteredMarketsInfoData = Object.fromEntries(
        Object.entries(marketInfo.modifiedMarketsInfoData).filter(
          ([_, marketData]) =>
            (marketData as any).indexToken?.symbol?.toUpperCase() === symbol ||
            (marketData as any).longToken?.symbol?.toUpperCase() === symbol ||
            (marketData as any).shortToken?.symbol?.toUpperCase() === symbol,
        ),
      );

      const tokenCount = Object.keys(filteredTokensData).length;
      const marketCount = Object.keys(filteredMarketsInfoData).length;

      message =
        tokenCount > 0
          ? `Found ${marketCount} markets and ${tokenCount} tokens for symbol ${symbol}.`
          : `No tokens found with symbol ${symbol}.`;
    }

    console.log('Debug: get market info message: ', message);

    const marketData = {
      success: marketInfo.success,
      totalMarketInfoCount: marketInfo.totalMarketInfoCount,
      totalTokenDataCount: marketInfo.totalTokenDataCount,
      // marketsInfoData: filteredMarketsInfoData,
      tokensData: filteredTokensData,
      errors: marketInfo.errors,
      message: message,
    };

    return {
      id: 'markets-query',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: marketInfo.success ? message : 'Failed to fetch market information.',
            },
          ],
        },
      },
      artifacts: [
        {
          name: 'markets-info',
          parts: [
            {
              type: 'data',
              data: marketData,
            },
          ],
        },
      ],
    };
  } catch (error) {
    context.log('Error handling markets query:', error);
    return {
      id: 'markets-query',
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            { type: 'text', text: 'Error fetching market information. Please try again later.' },
          ],
        },
      },
      artifacts: [
        {
          name: 'error',
          parts: [
            {
              type: 'data',
              data: { error: error instanceof Error ? error.message : String(error) },
            },
          ],
        },
      ],
    };
  }
}

/**
 * Handle positions query
 */
export async function handlePositionsQuery(
  args: { marketSymbol?: string },
  context: HandlerContext,
): Promise<Task> {
  try {
    console.log('Debug: getting position info');
    const positionInfo = await getPositionInfo(context.gmxClient);

    if (!positionInfo.success) {
      return {
        id: 'positions-query',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Failed to fetch position information: ${positionInfo.message}`,
              },
            ],
          },
        },
        artifacts: [],
      };
    }

    console.log('Debug: successfully got position info');

    const positionData = {
      success: true,
      positionCount: positionInfo.positionCount,
      // sending modifiedPositions to avoid bigInt serialization issues
      positions: positionInfo.modifiedPositions,
      message: `Found ${positionInfo.positionCount} active positions.`,
    };

    return {
      id: 'positions-query',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Found ${positionInfo.positionCount} active positions.`,
            },
          ],
        },
      },
      artifacts: [
        {
          name: 'positions-info',
          parts: [
            {
              type: 'data',
              data: positionData,
            },
          ],
        },
      ],
    };
  } catch (error) {
    context.log('Error handling positions query:', error);
    return {
      id: 'positions-query',
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            { type: 'text', text: 'Error fetching position information. Please try again later.' },
          ],
        },
      },
      artifacts: [
        {
          name: 'error',
          parts: [
            {
              type: 'data',
              data: { error: error instanceof Error ? error.message : String(error) },
            },
          ],
        },
      ],
    };
  }
}

/**
 * Handle swap query
 */
export async function handleSwapQuery(
  args: CreateSwapOrderParams,
  context: HandlerContext,
): Promise<Task> {
  try {
    console.log('Debug: creating swap order');
    console.log('Debug: args', args);

    // Make sure we're not passing any user address to the swap function
    const swapParams = {
      fromToken: args.fromToken,
      toToken: args.toToken,
      amount: args.amount,
      isLimit: args.isLimit,
      slippage: args.slippage
    };

    const swapOrder = await createSwapOrder(context.gmxClient, swapParams);
    console.log('Debug: swap order created', swapOrder);

    if (!swapOrder.success) {
      return {
        id: 'swap-query',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Failed to create swap order: ${swapOrder.message}` }],
          },

        },
        artifacts: [],
      };
    }

    return {
      id: 'swap-query',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Swap order created successfully for ${swapParams.fromToken} to ${swapParams.toToken} with amount ${swapParams.amount}.`,
            },
          ],
        },
      },
      artifacts: [
        {
          name: 'swap-info',
          parts: [
            {
              type: 'data',
              data: swapParams,
            },
          ],
        },
      ],
    };
  } catch (error) {
    context.log('Error handling swap query:', error);
    return {
      id: 'swap-query',
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Error creating swap order. Please try again later.' }],
        },
      },
      artifacts: [
        {
          name: 'error',
          parts: [
            {
              type: 'data',
              data: { error: error instanceof Error ? error.message : String(error) },
            },
          ],
        },
      ],
    };
  }
}

/**
 * Format amount to a readable string
 */
function formatAmount(amount: string | number | bigint, decimals: number): string {
  if (!amount) return '0';

  if (typeof amount === 'string') {
    const value = parseFloat(amount) / Math.pow(10, decimals);
    return value.toFixed(2);
  } else if (typeof amount === 'bigint') {
    const value = Number(amount) / Math.pow(10, decimals);
    return value.toFixed(2);
  } else {
    const value = amount / Math.pow(10, decimals);
    return value.toFixed(2);
  }
}

/**
 * Calculate leverage from size and collateral
 */
function calculateLeverage(
  size: string | number | bigint,
  collateral: string | number | bigint,
): string {
  if (!size || !collateral) return '0x';

  const sizeNum = typeof size === 'string' ? parseFloat(size) : Number(size);
  const collateralNum =
    typeof collateral === 'string' ? parseFloat(collateral) : Number(collateral);

  if (collateralNum === 0) return '0x';

  const leverage = sizeNum / collateralNum;
  return `${leverage.toFixed(2)}x`;
}

/**
 * Calculate PnL percentage
 */
function calculatePnlPercentage(
  pnl: string | number | bigint,
  collateral: string | number | bigint,
): string {
  if (!pnl || !collateral) return '0%';

  const pnlNum = typeof pnl === 'string' ? parseFloat(pnl) : Number(pnl);
  const collateralNum =
    typeof collateral === 'string' ? parseFloat(collateral) : Number(collateral);

  if (collateralNum === 0) return '0%';

  const pnlPercentage = (pnlNum / collateralNum) * 100;
  return `${pnlPercentage.toFixed(2)}%`;
}

/**
 * Handle create position request
 */
export async function handleCreatePositionRequest(
  args: CreatePositionParams | string,
  context: HandlerContext,
): Promise<Task> {
  try {
    let responseText = '';
    let positionData: any = {};

    // Check if args is an object (for structured API calls) or a string (for natural language processing)
    if (typeof args === 'object') {
      // Extract data from the args object
      const side = args.side;
      const isLong = side === 'LONG';
      const marketAddress = args.marketAddress;
      const amount = args.collateralAmount;
      const leverage = args.leverage;

      responseText = `Position creation request prepared for ${side} position with ${amount} collateral at ${leverage}x leverage`;
      positionData = {
        marketAddress,
        side,
        collateralAmount: amount,
        leverage,
        action: 'create_position',
      };
    } else {
      // Handle the string-based instruction
      const instruction = args;

      // Detect if it's a long or short
      const isLong =
        instruction.toLowerCase().includes('long') || !instruction.toLowerCase().includes('short');
      const side = isLong ? 'LONG' : 'SHORT';

      // Try to extract market (e.g., ETH, BTC)
      const marketMatches = instruction.match(/\b(ETH|BTC|LINK|UNI|ARB|SOL|AVAX)\b/i);
      const market = marketMatches ? marketMatches[0].toUpperCase() : 'ETH';

      // Try to extract collateral amount
      const amountMatches = instruction.match(
        /\b([\d.]+)\s*(ETH|BTC|LINK|UNI|ARB|SOL|AVAX|USD|USDC|USDT)\b/i,
      );
      const amount = amountMatches ? amountMatches[1] : '0.1';
      const collateralType =
        amountMatches && amountMatches[2] ? amountMatches[2].toUpperCase() : market;

      // Try to extract leverage
      const leverageMatches = instruction.match(/\b(\d+)x\b/i);
      const leverage = leverageMatches && leverageMatches[1] ? parseInt(leverageMatches[1]) : 2;

      // Get market information to find the market address
      const marketInfo = await getMarketInfo(context.gmxClient);
      if (!marketInfo.success) {
        return {
          id: 'create-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                { type: 'text', text: `Failed to fetch market information: ${marketInfo.message}` },
              ],
            },
          },
          artifacts: [],
        };
      }

      if (!marketInfo.markets || marketInfo.markets.length === 0) {
        return {
          id: 'create-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: 'No markets available.' }],
            },
          },
          artifacts: [],
        };
      }

      // Find the requested market
      const marketObj = marketInfo.markets.find((m: any) => m.indexToken?.toUpperCase() === market);

      if (!marketObj) {
        return {
          id: 'create-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Market not found for ${market}. Please specify a valid market (e.g., ETH, BTC).`,
                },
              ],
            },
          },
          artifacts: [],
        };
      }

      // Determine collateral token address based on long/short
      const collateralTokenSymbol = isLong ? marketObj.longToken : marketObj.shortToken;
      let collateralTokenAddress = '';

      // Find the token in the tokens array
      if (marketInfo.tokens && marketInfo.tokens.length > 0) {
        const collateralToken = marketInfo.tokens.find(
          (t: any) => t.symbol.toUpperCase() === collateralTokenSymbol.toUpperCase(),
        );

        if (collateralToken) {
          collateralTokenAddress = collateralToken.address;
        }
      }

      if (!collateralTokenAddress) {
        return {
          id: 'create-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                { type: 'text', text: `Failed to determine collateral token for ${market}.` },
              ],
            },
          },
          artifacts: [],
        };
      }

      responseText = `Position creation request prepared for ${market}/USD ${side} position with ${amount} ${collateralType} collateral at ${leverage}x leverage`;
      positionData = {
        market: `${market}/USD`,
        marketAddress: marketObj.address,
        side,
        collateralToken: collateralType,
        collateralTokenAddress,
        collateralAmount: amount,
        leverage,
        action: 'create_position',
      };
    }

    return {
      id: 'create-position',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: responseText }],
        },
      },
      artifacts: [
        {
          name: 'position-plan',
          parts: [
            {
              type: 'data',
              data: positionData,
            },
          ],
        },
      ],
    };
  } catch (error) {
    context.log('Error handling create position request:', error);
    return {
      id: 'create-position',
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: 'Error processing create position request. Please try a simpler format or check your input.',
            },
          ],
        },
      },
      artifacts: [
        {
          name: 'error',
          parts: [
            {
              type: 'data',
              data: { error: error instanceof Error ? error.message : String(error) },
            },
          ],
        },
      ],
    };
  }
}

/**
 * Handle close position request
 */
export async function handleClosePositionRequest(
  args: DecreasePositionParams | string,
  context: HandlerContext,
): Promise<Task> {
  try {
    let responseText = '';
    let positionData: any = {};

    // Handle object-based input
    if (typeof args === 'object') {
      const marketAddress = args.marketAddress;
      const isClosePosition = args.isClosePosition;
      const collateralAmount = args.collateralAmount;

      responseText = `Position ${isClosePosition ? 'close' : 'decrease'} request prepared for market ${marketAddress}`;
      positionData = {
        marketAddress,
        isClosePosition,
        collateralAmount,
        collateralTokenAddress: args.collateralTokenAddress,
        action: isClosePosition ? 'close_position' : 'decrease_position',
      };
    } else {
      // Handle string-based instruction
      const instruction = args;

      // Try to extract market (e.g., ETH, BTC)
      const marketMatches = instruction.match(/\b(ETH|BTC|LINK|UNI|ARB|SOL|AVAX)\b/i);
      const market = marketMatches ? marketMatches[0].toUpperCase() : 'ETH';

      // Get position information to check if the position exists
      const positionInfo = await getPositionInfo(context.gmxClient);

      if (!positionInfo.success) {
        return {
          id: 'close-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Failed to fetch position information: ${positionInfo.message}`,
                },
              ],
            },
          },
          artifacts: [],
        };
      }

      // Check if there are any positions
      if (!positionInfo.positions || positionInfo.positionCount === 0) {
        return {
          id: 'close-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: 'No active positions found to close.' }],
            },
          },
          artifacts: [],
        };
      }

      // Find the position for the requested market
      const position = positionInfo.modifiedPositions.find(
        (p: any) => p.market && p.market.toUpperCase().includes(market),
      );

      if (!position) {
        const availablePositions = positionInfo.modifiedPositions
          .map((p: any, i: number) => `${i + 1}. ${p.market || 'Unknown'} (${p.side || 'Unknown'})`)
          .join('\n');

        return {
          id: 'close-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `No active position found for ${market}. Available positions:\n${availablePositions}`,
                },
              ],
            },
          },
          artifacts: [],
        };
      }

      responseText = `Position close request prepared for ${position.market} ${position.side} position`;
      positionData = {
        market: position.market,
        marketAddress: position.marketAddress,
        side: position.side,
        size: position.size,
        pnl: position.pnl,
        pnlPercentage: position.pnlPercentage,
        isClosePosition: true,
        action: 'close_position',
      };
    }

    return {
      id: 'close-position',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: responseText }],
        },
      },
      artifacts: [
        {
          name: 'position-plan',
          parts: [
            {
              type: 'data',
              data: positionData,
            },
          ],
        },
      ],
    };
  } catch (error) {
    context.log('Error handling close position request:', error);
    return {
      id: 'close-position',
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: 'Error processing close position request. Please try a simpler format or check your input.',
            },
          ],
        },
      },
      artifacts: [
        {
          name: 'error',
          parts: [
            {
              type: 'data',
              data: { error: error instanceof Error ? error.message : String(error) },
            },
          ],
        },
      ],
    };
  }
}

const GetPositionInfoSchema = z.object({
  userAddress: z
    .string()
    .optional()
    .describe('Optional. User address starting with "0x". If not provided, will use the address from GMX client.'),
  marketSymbol: z
    .string()
    .optional()
    .describe('Optional. Specific market symbol to filter positions by (e.g., "ETH", "BTC").'),
});

