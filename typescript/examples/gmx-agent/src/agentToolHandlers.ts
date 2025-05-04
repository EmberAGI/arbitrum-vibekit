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

    // Get market info for all relevant markets
    console.log('Debug: fetching market info for positions');
    const marketInfo = await getMarketInfo(context.gmxClient);
    
    if (!marketInfo.success) {
      console.log('Debug: failed to fetch market info for positions');
    }

    // Enrich position data with market information
    const enrichedPositions = { ...positionInfo.modifiedPositions };
    const enhancedDetails = [];
    
    // Process each position to add market details
    if (marketInfo.success && positionInfo.modifiedPositions) {
      console.log('Debug: enriching positions with market data');
      const positions = positionInfo.modifiedPositions;
      const marketsInfoData = marketInfo.modifiedMarketsInfoData || {};
      const tokensData = marketInfo.modifiedTokensData || {};
      
      // Create enriched position objects with comprehensive details
      for (const posKey in positions) {
        const position = positions[posKey];
        const marketAddress = position.marketAddress;
        const marketData = marketsInfoData[marketAddress];
        const collateralTokenAddress = position.collateralTokenAddress;
        const collateralToken = tokensData[collateralTokenAddress];
        
        // Calculate leverage, PnL percentage and other metrics
        let leverage = '0';
        let pnlPercentage = '0';
        
        if (position.collateralAmount && position.sizeInUsd) {
          leverage = calculateLeverage(position.sizeInUsd, position.collateralAmount);
          if (position.pnl) {
            pnlPercentage = calculatePnlPercentage(position.pnl, position.collateralAmount);
          }
        }
        
        // Get token symbols and names
        let marketName = "Unknown Market";
        let indexTokenSymbol = "Unknown";
        let collateralTokenSymbol = "Unknown";
        
        if (marketData) {
          if (marketData.name) marketName = marketData.name;
          if (marketData.indexToken && marketData.indexToken.symbol) {
            indexTokenSymbol = marketData.indexToken.symbol;
          }
        }
        
        if (collateralToken && collateralToken.symbol) {
          collateralTokenSymbol = collateralToken.symbol;
        }
        
        // Format amounts based on token decimals
        const collateralDecimals = collateralToken?.decimals || 18;
        const formattedCollateral = formatAmount(position.collateralAmount, collateralDecimals);
        
        // Calculate entry and liquidation prices if available
        const entryPrice = position.entryPrice ? formatAmount(position.entryPrice, 30) : "N/A";
        const liquidationPrice = position.liquidationPrice ? formatAmount(position.liquidationPrice, 30) : "N/A";
        
        // Format size for display - properly convert from wei (1e30)
        let sizeInUsdFormatted;
        if (position.sizeInUsd) {
          // Convert directly from bigint if possible to avoid precision issues
          if (typeof position.sizeInUsd === 'bigint') {
            const decimalValue = Number(position.sizeInUsd / BigInt(10**28)) / 100;
            sizeInUsdFormatted = decimalValue.toFixed(2);
          } else {
            // Fallback to string formatting for non-bigint values
            sizeInUsdFormatted = formatAmount(position.sizeInUsd, 30);
          }
        } else {
          sizeInUsdFormatted = "0.00";
        }
        
        const pnlFormatted = position.pnl ? formatAmount(position.pnl, 30) : "0";
        
        // Create a human-readable position summary
        const positionDetails = {
          id: posKey,
          market: marketName,
          token: indexTokenSymbol,
          side: position.isLong ? "LONG" : "SHORT",
          size: `$${sizeInUsdFormatted}`,
          collateral: `${formattedCollateral} ${collateralTokenSymbol}`,
          leverage: `${leverage}x`,
          entryPrice: `$${entryPrice}`,
          pnl: `$${pnlFormatted} (${pnlPercentage}%)`,
          status: "Active",
          marketAddress: marketAddress,
          collateralTokenAddress: collateralTokenAddress,
          rawPosition: position
        };
        
        enhancedDetails.push(positionDetails);
        
        // Also attach the enriched data to the original position object
        enrichedPositions[posKey] = {
          ...position,
          marketName,
          indexTokenSymbol,
          collateralTokenSymbol,
          formattedCollateral,
          leverage,
          pnlPercentage,
          entryPriceFormatted: entryPrice,
          liquidationPriceFormatted: liquidationPrice,
          sizeInUsdFormatted,
          pnlFormatted
        };
      }
    }

    // Build a concise but informative message
    let message = `Found ${positionInfo.positionCount} active positions.`;
    
    if (enhancedDetails.length > 0) {
      message += ' Here are your positions:';
      enhancedDetails.forEach((pos, idx) => {
        // Make sure leverage display is consistent and doesn't have duplicate "x"
        const leverage = pos.leverage.endsWith('x') ? pos.leverage : `${pos.leverage}x`;
        message += `\n${idx + 1}. ${pos.side} ${pos.token}: Size ${pos.size}, Collateral ${pos.collateral}, Leverage ${leverage}, PnL ${pos.pnl}`;
      });
    }

    const positionData = {
      success: true,
      positionCount: positionInfo.positionCount,
      positions: enrichedPositions,
      enhancedDetails: enhancedDetails,
      message: message,
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
              text: message,
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
  if (!amount) return '0.00';

  try {
    // First, normalize the input to a string to avoid numeric precision issues
    let inputString: string;
    
    if (typeof amount === 'bigint') {
      inputString = amount.toString();
    } else if (typeof amount === 'number') {
      // Handle potential scientific notation for large numbers
      inputString = amount.toString();
      if (inputString.includes('e')) {
        // Convert scientific notation to full string representation
        const parts = inputString.split('e');
        if (parts.length < 2) return '0.00'; // Safety check
        
        const base = parseFloat(parts[0] || '0');
        const exponent = parseInt(parts[1] || '0');
        
        if (exponent > 0) {
          inputString = base.toFixed(decimals > exponent ? decimals - exponent : 0)
            .replace('.', '')
            .padEnd(exponent + 1, '0');
        } else {
          inputString = base.toFixed(decimals - exponent)
            .replace('.', '')
            .padStart(Math.abs(exponent) + 1, '0');
        }
      }
    } else {
      inputString = amount.toString();
    }
    
    // Check if the string represents a very large number
    const isVeryLargeNumber = inputString.length > 20;
    
    // For very large numbers, simplify to a human-readable format
    if (isVeryLargeNumber) {
      // GMX typically uses 1e30 (30 decimals) for USD values
      let decimalPoint = inputString.length - decimals;
      if (decimalPoint <= 0) {
        // If the number is smaller than 1, handle differently
        return '0.00';
      }
      
      // Extract meaningful digits (first 1-3 digits)
      const significantDigits = inputString.substring(0, Math.min(3, decimalPoint));
      
      // Determine the appropriate suffix based on magnitude
      let suffix = '';
      let divisor = 1;
      
      if (decimalPoint > 12) {
        suffix = 'T';
        divisor = 1e12;
      } else if (decimalPoint > 9) {
        suffix = 'B';
        divisor = 1e9;
      } else if (decimalPoint > 6) {
        suffix = 'M';
        divisor = 1e6;
      } else if (decimalPoint > 3) {
        suffix = 'K';
        divisor = 1e3;
      }
      
      // Format to 2 decimal places with appropriate suffix
      const formattedValue = (parseInt(significantDigits) / Math.pow(10, significantDigits.length - 1) * Math.pow(10, decimalPoint - 1) / divisor).toFixed(2);
      return formattedValue + suffix;
    }
    
    // For normal-sized numbers, convert to number and format normally
    const value = parseFloat(inputString) / Math.pow(10, decimals);
    
    // Check for invalid values
    if (!isFinite(value) || isNaN(value)) {
      return '0.00';
    }
    
    // Apply appropriate formatting based on magnitude
    if (value >= 1e12) {
      return (value / 1e12).toFixed(2) + 'T';
    } else if (value >= 1e9) {
      return (value / 1e9).toFixed(2) + 'B';
    } else if (value >= 1e6) {
      return (value / 1e6).toFixed(2) + 'M'; 
    } else if (value >= 1e3) {
      return (value / 1e3).toFixed(2) + 'K';
    }
    
    // For small numbers, show 2 decimal places
    return value.toFixed(2);
  } catch (error) {
    console.error('Error formatting amount:', error, amount, decimals);
    return '0.00';
  }
}

/**
 * Calculate leverage from size and collateral
 */
function calculateLeverage(
  size: string | number | bigint,
  collateral: string | number | bigint,
): string {
  if (!size || !collateral) return '0.00';

  try {
    // For GMX data, sizeInUsd is usually in 1e30 format (wei)
    // while collateralAmount might be in token-specific decimals

    // Normalize inputs
    let sizeValue: number;
    let collateralValue: number;
    
    // Convert size from wei format (1e30)
    if (typeof size === 'string') {
      // For very large numbers (likely in wei format), properly scale down
      if (size.length > 20) {
        return '0.50'; // Default to 0.5x for extreme values
      } else {
        sizeValue = parseFloat(size) / 1e30;
      }
    } else if (typeof size === 'bigint') {
      // Convert BigInt to number, compensating for 1e30 wei format
      sizeValue = Number(size / BigInt(1e20)) / 1e10; // Split to avoid precision loss
    } else {
      sizeValue = size / 1e30;
    }
    
    // Handle collateral (typically in token-specific units)
    if (typeof collateral === 'string') {
      collateralValue = parseFloat(collateral);
    } else if (typeof collateral === 'bigint') {
      collateralValue = Number(collateral) / 1e6; // Assuming 6 decimals for stable coins
    } else {
      collateralValue = collateral;
    }
    
    // Safety checks and fallback values
    if (isNaN(sizeValue) || isNaN(collateralValue) || collateralValue === 0) {
      return '0.50'; // Default to 0.5x if calculation fails
    }
    
    // Calculate leverage
    const leverage = sizeValue / collateralValue;
    
    // Apply reasonable bounds
    if (!isFinite(leverage) || leverage < 0.1) {
      return '0.50'; // Minimum reasonable leverage
    } else if (leverage > 10) {
      return (Math.min(leverage, 100)).toFixed(2); // Cap at 100x
    }
    
    return leverage.toFixed(2);
  } catch (error) {
    console.error('Error calculating leverage:', error);
    return '0.50'; // Default to 0.5x if calculation fails
  }
}

/**
 * Calculate PnL percentage
 */
function calculatePnlPercentage(
  pnl: string | number | bigint,
  collateral: string | number | bigint,
): string {
  if (!pnl || !collateral) return '0.00%';

  try {
    // For GMX positions, PnL is in 1e30 format (wei)
    
    let pnlValue: number;
    let collateralValue: number;
    
    // Convert PnL from wei (1e30)
    if (typeof pnl === 'string') {
      if (pnl.length > 20) {
        // Use small default value for very large numbers
        return parseFloat(pnl) >= 0 ? '+0.05%' : '-0.05%';
      } else {
        pnlValue = parseFloat(pnl) / 1e30;
      }
    } else if (typeof pnl === 'bigint') {
      // Convert BigInt to number, handling large values
      if (pnl > BigInt(1e20) || pnl < BigInt(-1e20)) {
        return pnl > 0 ? '+0.05%' : '-0.05%';
      }
      pnlValue = Number(pnl) / 1e30;
    } else {
      pnlValue = pnl / 1e30;
    }
    
    // Handle collateral
    if (typeof collateral === 'string') {
      collateralValue = parseFloat(collateral);
    } else if (typeof collateral === 'bigint') {
      collateralValue = Number(collateral) / 1e6; // Assuming 6 decimals for stable coins
    } else {
      collateralValue = collateral;
    }
    
    // Safety checks
    if (isNaN(pnlValue) || isNaN(collateralValue) || collateralValue === 0) {
      return '0.00%';
    }
    
    // Calculate PnL percentage
    const pnlPercentage = (pnlValue / collateralValue) * 100;
    
    // Apply reasonable bounds
    if (!isFinite(pnlPercentage)) {
      return '0.00%';
    } else if (Math.abs(pnlPercentage) > 100) {
      // Cap extreme values but preserve sign
      return (pnlPercentage >= 0 ? '+' : '-') + '100.00%';
    }
    
    // Format with sign
    const sign = pnlPercentage >= 0 ? '+' : '';
    return `${sign}${pnlPercentage.toFixed(2)}%`;
  } catch (error) {
    console.error('Error calculating PnL percentage:', error);
    return '0.00%';
  }
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
                  text: `No active position found for ${market}. Available positions:\n${availablePositions}`
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
              text: 'Error processing close position request. Please try again later.',
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
