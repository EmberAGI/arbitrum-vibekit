import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ethers } from 'ethers';
import type { Task as A2ATask } from 'a2a-samples-js/schema';
import { GmxSdk } from '@gmx-io/sdk';
import type { PositionsData } from '@gmx-io/sdk/types/positions.js';
import { getMarketInfo } from './gmx/markets.js';
import { getPositionInfo } from './gmx/positions.js';


// Re-export Task type
export type Task = A2ATask;

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

// Define types for the schemas
export type CreatePositionParams = z.infer<typeof CreatePositionSchema>;
export type DecreasePositionParams = z.infer<typeof DecreasePositionSchema>;

// Define schemas for GMX agent handlers
export const GmxQuerySchema = z.object({
  instruction: z.string(),
  userAddress: z.string().optional(),
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
  toolName: string
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
        `Failed to parse nested JSON response from ${toolName}: ${(e as Error).message}`
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
export async function handleMarketsQuery(context: HandlerContext): Promise<Task> {
  try {
    console.log("Debug: getting market info");
    const marketInfo = await getMarketInfo(context.gmxClient);
    if(!marketInfo.success) {
      console.log(`Failed to fetch market information}`);
    }

    console.log("Debug: successfully got market info");
    
    const marketData = {
      success: marketInfo.success,
      marketInfoCount: marketInfo.marketInfoCount,
      tokenDataCount: marketInfo.tokenDataCount,
      marketsInfoData: marketInfo.modifiedMarketsInfoData,
      tokensData: marketInfo.modifiedTokensData,
      errors: marketInfo.errors,
      message: `Found ${marketInfo.marketInfoCount} markets and ${marketInfo.tokenDataCount} tokens.`
    };

    return {
      id: 'markets-query',
      status: {
        state: marketInfo.success ? 'completed' : 'failed',
        message: {
          role: 'agent',
          parts: [{ 
            type: 'text', 
            text: marketInfo.success 
              ? `Found ${marketInfo.marketInfoCount} markets and ${marketInfo.tokenDataCount} tokens.` 
              : 'Failed to fetch market information.'
          }],
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
          parts: [{ type: 'text', text: 'Error fetching market information. Please try again later.' }],
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
  args: { marketSymbol?: string, userAddress: string },
  context: HandlerContext
): Promise<Task> {
  try {
    if(!args.userAddress) {
      return {
        id: 'positions-query',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: 'No user address provided' }],
          },
        },
        artifacts: [],
      };
    }
    
    console.log("Debug: getting position info");
    const positionInfo = await getPositionInfo(context.gmxClient, args.userAddress);
    
    if (!positionInfo.success) {
      return {
        id: 'positions-query',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Failed to fetch position information: ${positionInfo.message}` }],
          },
        },
        artifacts: [],
      };
    }
    
    console.log("Debug: successfully got position info");

    const positionData = {
      success: true,
      positionCount: positionInfo.positionCount,
      positions: positionInfo.modifiedPositions,
      message: `Found ${positionInfo.positionCount} active positions.`
    };

    return {
      id: 'positions-query',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ 
            type: 'text', 
            text: `Found ${positionInfo.positionCount} active positions.` 
          }],
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
          parts: [{ type: 'text', text: 'Error fetching position information. Please try again later.' }],
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
function calculateLeverage(size: string | number | bigint, collateral: string | number | bigint): string {
  if (!size || !collateral) return '0x';
  
  const sizeNum = typeof size === 'string' ? parseFloat(size) : Number(size);
  const collateralNum = typeof collateral === 'string' ? parseFloat(collateral) : Number(collateral);
  
  if (collateralNum === 0) return '0x';
  
  const leverage = sizeNum / collateralNum;
  return `${leverage.toFixed(2)}x`;
}

/**
 * Calculate PnL percentage
 */
function calculatePnlPercentage(pnl: string | number | bigint, collateral: string | number | bigint): string {
  if (!pnl || !collateral) return '0%';
  
  const pnlNum = typeof pnl === 'string' ? parseFloat(pnl) : Number(pnl);
  const collateralNum = typeof collateral === 'string' ? parseFloat(collateral) : Number(collateral);
  
  if (collateralNum === 0) return '0%';
  
  const pnlPercentage = (pnlNum / collateralNum) * 100;
  return `${pnlPercentage.toFixed(2)}%`;
}

/**
 * Handle create position request
 */
export async function handleCreatePositionRequest(
  args: CreatePositionParams | string,
  context: HandlerContext
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
        action: 'create_position'
      };
    } else {
      // Handle the string-based instruction
      const instruction = args;
      
      // Detect if it's a long or short
      const isLong = instruction.toLowerCase().includes('long') || !instruction.toLowerCase().includes('short');
      const side = isLong ? 'LONG' : 'SHORT';
      
      // Try to extract market (e.g., ETH, BTC)
      const marketMatches = instruction.match(/\b(ETH|BTC|LINK|UNI|ARB|SOL|AVAX)\b/i);
      const market = marketMatches ? marketMatches[0].toUpperCase() : 'ETH';
      
      // Try to extract collateral amount
      const amountMatches = instruction.match(/\b([\d.]+)\s*(ETH|BTC|LINK|UNI|ARB|SOL|AVAX|USD|USDC|USDT)\b/i);
      const amount = amountMatches ? amountMatches[1] : '0.1';
      const collateralType = (amountMatches && amountMatches[2]) ? amountMatches[2].toUpperCase() : market;
      
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
              parts: [{ type: 'text', text: `Failed to fetch market information: ${marketInfo.message}` }],
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
      const marketObj = marketInfo.markets.find((m: any) => 
        m.indexToken?.toUpperCase() === market);
      
      if (!marketObj) {
        return {
          id: 'create-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Market not found for ${market}. Please specify a valid market (e.g., ETH, BTC).` }],
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
        const collateralToken = marketInfo.tokens.find((t: any) => 
          t.symbol.toUpperCase() === collateralTokenSymbol.toUpperCase());
        
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
              parts: [{ type: 'text', text: `Failed to determine collateral token for ${market}.` }],
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
        action: 'create_position'
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
          parts: [{ type: 'text', text: 'Error processing create position request. Please try a simpler format or check your input.' }],
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
  context: HandlerContext
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
        action: isClosePosition ? 'close_position' : 'decrease_position'
      };
    } else {
      // Handle string-based instruction
      const instruction = args;
      
      // Try to extract market (e.g., ETH, BTC)
      const marketMatches = instruction.match(/\b(ETH|BTC|LINK|UNI|ARB|SOL|AVAX)\b/i);
      const market = marketMatches ? marketMatches[0].toUpperCase() : 'ETH';
      
      // Use a demo account address if one is provided in .env, otherwise use a placeholder
      const demoAccount = process.env.DEMO_ACCOUNT || '0x0000000000000000000000000000000000000000';
      
      // Get position information to check if the position exists
      const positionInfo = await getPositionInfo(context.gmxClient, demoAccount);
      
      if (!positionInfo.success) {
        return {
          id: 'close-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Failed to fetch position information: ${positionInfo.message}` }],
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
      const position = positionInfo.modifiedPositions.find((p: any) => 
        p.market && p.market.toUpperCase().includes(market));
      
      if (!position) {
        const availablePositions = positionInfo.modifiedPositions.map((p: any, i: number) => 
          `${i+1}. ${p.market || 'Unknown'} (${p.side || 'Unknown'})`).join('\n');
          
        return {
          id: 'close-position',
          status: {
            state: 'failed',
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `No active position found for ${market}. Available positions:\n${availablePositions}` }],
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
        action: 'close_position'
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
          parts: [{ type: 'text', text: 'Error processing close position request. Please try a simpler format or check your input.' }],
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
