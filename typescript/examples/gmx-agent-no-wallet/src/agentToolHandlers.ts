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
export async function handleMarketsQuery(context: HandlerContext): Promise<string> {
  try {
    const marketInfo = await getMarketInfo(context.gmxClient);
    
    if (!marketInfo.success) {
      return `Failed to fetch market information: ${marketInfo.message}`;
    }
    
    if (marketInfo.marketsTable) {
      return `Available GMX Markets (${marketInfo.marketCount}):\n\n${marketInfo.marketsTable}`;
    }
    
    // Fallback if marketsTable is not available
    let response = `Available GMX Markets (${marketInfo.marketCount}):\n\n`;
    
    if (marketInfo.markets && marketInfo.markets.length > 0) {
      marketInfo.markets.forEach((market, index: number) => {
        response += `${index + 1}. ${market.name}\n`;
        response += `   Index Token: ${market.indexToken}\n`;
        response += `   Long Token: ${market.longToken}\n`;
        response += `   Short Token: ${market.shortToken}\n\n`;
      });
    } else {
      response += "No markets available.";
    }
    
    return response;
  } catch (error) {
    context.log('Error handling markets query:', error);
    return 'Error fetching market information. Please try again later.';
  }
}

/**
 * Handle positions query
 */
export async function handlePositionsQuery(
  args: { marketSymbol?: string, userAddress?: string } | string,
  context: HandlerContext
): Promise<string> {
  try {
    // Process the input based on whether it's a string or an object
    const instruction = typeof args === 'string' ? args : '';
    
    // Use a demo account address if one is provided in .env, otherwise use a placeholder
    const demoAccount = process.env.DEMO_ACCOUNT || '0x0000000000000000000000000000000000000000';
    
    // If userAddress is provided in args (as an object), use that instead
    const userAddress = typeof args === 'object' && args.userAddress ? args.userAddress : demoAccount;
    
    const positionInfo = await getPositionInfo(context.gmxClient, userAddress);
    
    if (!positionInfo.success) {
      return `Failed to fetch position information: ${positionInfo.message}`;
    }
    
    // Handle case where positions is not an array but PositionsData type
    const positions = positionInfo.positions;
    if (!positions || (typeof positions === 'object' && Object.keys(positions).length === 0)) {
      return `No active positions found for the account.`;
    }
    
    // If positions is an array with length property, we can check it directly
    if (Array.isArray(positions) && positions.length === 0) {
      return `No active positions found for the account.`;
    }
    
    // Process position data for display
    let processedPositions: any[] = [];
    
    // If positions is a PositionsData object, convert to array for display
    if (typeof positions === 'object' && !Array.isArray(positions)) {
      const positionEntries = Object.entries(positions);
      const positionCount = positionEntries.length;
      
      if (positionCount === 0) {
        return `No active positions found for the account.`;
      }
      
      // Format the positions in a readable way
      processedPositions = positionEntries.map(([key, position]: [string, any]) => {
        const market = position.marketInfo?.indexToken?.symbol 
          ? `${position.marketInfo.indexToken.symbol}/USD` 
          : 'Unknown Market';
          
        return {
          key,
          market,
          side: position.isLong ? 'LONG' : 'SHORT',
          size: formatAmount(position.sizeInUsd, 30),
          collateral: formatAmount(position.collateralAmount, position.marketInfo?.longToken?.decimals || 18),
          leverage: calculateLeverage(position.sizeInUsd, position.collateralUsd),
          entryPrice: formatAmount(position.entryPrice, 30),
          markPrice: formatAmount(position.markPrice, 30),
          liquidationPrice: formatAmount(position.liquidationPrice, 30),
          pnl: formatAmount(position.pnl, 30),
          pnlPercentage: calculatePnlPercentage(position.pnl, position.collateralUsd),
        };
      });
    } else if (Array.isArray(positions)) {
      processedPositions = positions;
    }
    
    let response = `Active Positions (${processedPositions.length}):\n\n`;
    
    processedPositions.forEach((position, index) => {
      response += `${index + 1}. ${position.market} - ${position.side}\n`;
      response += `   Size: ${position.size} USD\n`;
      response += `   Collateral: ${position.collateral}\n`;
      response += `   Leverage: ${position.leverage}\n`;
      response += `   Entry Price: ${position.entryPrice}\n`;
      response += `   Current Price: ${position.markPrice}\n`;
      response += `   Liquidation Price: ${position.liquidationPrice}\n`;
      response += `   PnL: ${position.pnl} (${position.pnlPercentage})\n\n`;
    });
    
    return response;
  } catch (error) {
    context.log('Error handling positions query:', error);
    return 'Error fetching position information. Please try again later.';
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
): Promise<string> {
  try {
    // Check if args is an object (for structured API calls) or a string (for natural language processing)
    if (typeof args === 'object') {
      // Extract data from the args object
      const side = args.side;
      const isLong = side === 'LONG';
      const marketAddress = args.marketAddress;
      const amount = args.collateralAmount;
      const leverage = args.leverage;
      
      // Return simulated response
      return `Position Creation Request (Simulated):\n\n` +
             `Market Address: ${marketAddress}\n` +
             `Side: ${side}\n` +
             `Collateral: ${amount}\n` +
             `Leverage: ${leverage}x\n\n` +
             `This is a simulated response. In a wallet-connected implementation, ` +
             `this would create an actual position on GMX.`;
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
        return `Failed to fetch market information: ${marketInfo.message}`;
      }
      
      if (!marketInfo.markets || marketInfo.markets.length === 0) {
        return `No markets available.`;
      }
      
      // Find the requested market
      const marketObj = marketInfo.markets.find((m) => 
        m.indexToken?.toUpperCase() === market);
      
      if (!marketObj) {
        return `Market not found for ${market}. Please specify a valid market (e.g., ETH, BTC).`;
      }
      
      // Determine collateral token address based on long/short
      const collateralTokenSymbol = isLong ? marketObj.longToken : marketObj.shortToken;
      let collateralTokenAddress = '';
      
      // Find the token in the tokens array
      if (marketInfo.tokens && marketInfo.tokens.length > 0) {
        const collateralToken = marketInfo.tokens.find(t => 
          t.symbol.toUpperCase() === collateralTokenSymbol.toUpperCase());
        
        if (collateralToken) {
          collateralTokenAddress = collateralToken.address;
        }
      }
      
      if (!collateralTokenAddress) {
        return `Failed to determine collateral token for ${market}.`;
      }
      
      // In a real wallet-connected implementation, this would create an actual position
      // For this example, we'll simulate the response
      
      return `Position Creation Request (Simulated):\n\n` +
             `Market: ${market}/USD\n` +
             `Side: ${side}\n` +
             `Collateral: ${amount} ${collateralType}\n` +
             `Leverage: ${leverage}x\n\n` +
             `This is a simulated response. In a wallet-connected implementation, ` +
             `this would create an actual position on GMX.`;
    }
  } catch (error) {
    context.log('Error handling create position request:', error);
    return 'Error processing create position request. Please try a simpler format or check your input.';
  }
}

/**
 * Handle close position request
 */
export async function handleClosePositionRequest(
  args: DecreasePositionParams | string,
  context: HandlerContext
): Promise<string> {
  try {
    // Handle object-based input
    if (typeof args === 'object') {
      const marketAddress = args.marketAddress;
      const isClosePosition = args.isClosePosition;
      const collateralAmount = args.collateralAmount;
      
      // Return simulated response for the object-based input
      return `Position ${isClosePosition ? 'Close' : 'Decrease'} Request (Simulated):\n\n` +
             `Market Address: ${marketAddress}\n` +
             `${isClosePosition ? 'Close Position: Yes' : 'Decrease Amount: ' + collateralAmount}\n\n` +
             `This is a simulated response. In a wallet-connected implementation, ` +
             `this would ${isClosePosition ? 'close' : 'decrease'} the actual position on GMX.`;
    }
    
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
      return `Failed to fetch position information: ${positionInfo.message}`;
    }
    
    // Process position data for display
    let processedPositions: any[] = [];
    const positions = positionInfo.positions;
    
    // If positions is a PositionsData object, convert to array for display
    if (typeof positions === 'object' && !Array.isArray(positions)) {
      const positionEntries = Object.entries(positions);
      
      if (positionEntries.length === 0) {
        return `No active positions found to close.`;
      }
      
      // Format the positions in a readable way
      processedPositions = positionEntries.map(([key, position]: [string, any]) => {
        const marketSymbol = position.marketInfo?.indexToken?.symbol || 'Unknown';
        return {
          key,
          market: `${marketSymbol}/USD`,
          side: position.isLong ? 'LONG' : 'SHORT',
          size: formatAmount(position.sizeInUsd, 30),
          pnl: formatAmount(position.pnl, 30),
          pnlPercentage: calculatePnlPercentage(position.pnl, position.collateralUsd),
        };
      });
    } else if (Array.isArray(positions) && positions.length > 0) {
      processedPositions = positions;
    } else {
      return `No active positions found to close.`;
    }
    
    // Look for a position in the specified market
    const position = processedPositions.find(p => 
      p.market.toUpperCase().includes(market));
    
    if (!position) {
      return `No active position found for ${market}. Available positions:\n` +
             processedPositions.map((p, i) => `${i+1}. ${p.market} (${p.side})`).join('\n');
    }
    
    // In a real wallet-connected implementation, this would close the actual position
    // For this example, we'll simulate the response
    
    return `Position Close Request (Simulated):\n\n` +
           `Market: ${position.market}\n` +
           `Side: ${position.side}\n` +
           `Size: ${position.size} USD\n` +
           `Current PnL: ${position.pnl} (${position.pnlPercentage})\n\n` +
           `This is a simulated response. In a wallet-connected implementation, ` +
           `this would close the actual position on GMX.`;
  } catch (error) {
    context.log('Error handling close position request:', error);
    return 'Error processing close position request. Please try a simpler format or check your input.';
  }
}
