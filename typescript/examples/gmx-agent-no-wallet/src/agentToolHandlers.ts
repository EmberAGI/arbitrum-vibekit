import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ethers } from 'ethers';
import type { Task as A2ATask } from 'a2a-samples-js/schema';

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

// Define schemas for GMX agent handlers
export const GmxQuerySchema = z.object({
  instruction: z.string(),
  userAddress: z.string().optional(),
});

export interface HandlerContext {
  gmxClient: any;
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
 * Handler for GMX agent queries
 */
export async function handleGmxQuery(
  params: {
    instruction: string;
    userAddress?: string;
  },
  context: HandlerContext
): Promise<Task> {
  try {
    context.log(`Processing instruction: ${params.instruction}`);
    
    // Process the instruction and return appropriate response
    const response = await processInstruction(params.instruction, context);
    
    // Create a completed task with the response
    return {
      id: `gmx-query-${Date.now()}`,
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: response }]
        }
      }
    };
  } catch (error) {
    context.log(`Error handling GMX query:`, error);
    
    // Return a failed task with error message
    return {
      id: `gmx-query-error-${Date.now()}`,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ 
            type: 'text', 
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }]
        }
      }
    };
  }
}

/**
 * Process instruction and return appropriate response
 */
async function processInstruction(
  instruction: string,
  context: HandlerContext
): Promise<string> {
  const lowerInstruction = instruction.toLowerCase();
  
  // Basic NLP detection of intent
  if (lowerInstruction.includes('markets') || lowerInstruction.includes('available') || lowerInstruction.includes('show')) {
    return await handleMarketsQuery(context);
  } else if (lowerInstruction.includes('positions') || lowerInstruction.includes('my position')) {
    return await handlePositionsQuery(instruction, context);
  } else if ((lowerInstruction.includes('create') || lowerInstruction.includes('open') || 
              lowerInstruction.includes('long') || lowerInstruction.includes('short')) && 
              (lowerInstruction.includes('position') || lowerInstruction.includes('trade'))) {
    return await handleCreatePositionRequest(instruction, context);
  } else if ((lowerInstruction.includes('close') || lowerInstruction.includes('decrease') || 
              lowerInstruction.includes('exit')) && lowerInstruction.includes('position')) {
    return await handleClosePositionRequest(instruction, context);
  } else {
    // Default to help message
    return getHelpMessage();
  }
}

/**
 * Handle markets query
 */
async function handleMarketsQuery(context: HandlerContext): Promise<string> {
  try {
    const { getMarketInfo } = await import('./gmx/markets.js');
    const marketInfo = await getMarketInfo(context.gmxClient);
    
    if (!marketInfo.success) {
      return `Failed to fetch market information: ${marketInfo.message}`;
    }
    
    let response = `Available GMX Markets (${marketInfo.marketCount}):\n\n`;
    
    if (marketInfo.markets && marketInfo.markets.length > 0) {
      marketInfo.markets.forEach((market: any, index: number) => {
        const marketName = market.marketInfo?.indexToken?.symbol 
          ? `${market.marketInfo.indexToken.symbol}/USD` 
          : 'Unknown Market';
          
        response += `${index + 1}. ${marketName}\n`;
        response += `   Long Token: ${market.marketInfo?.longToken?.symbol || 'Unknown'}\n`;
        response += `   Short Token: ${market.marketInfo?.shortToken?.symbol || 'Unknown'}\n\n`;
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
async function handlePositionsQuery(instruction: string, context: HandlerContext): Promise<string> {
  try {
    const { getPositionInfo } = await import('./gmx/positions.js');
    
    // Use a demo account address if one is provided in .env, otherwise use a placeholder
    const demoAccount = process.env.DEMO_ACCOUNT || '0x0000000000000000000000000000000000000000';
    
    const positionInfo = await getPositionInfo(context.gmxClient, demoAccount);
    
    if (!positionInfo.success) {
      return `Failed to fetch position information: ${positionInfo.message}`;
    }
    
    if (!positionInfo.positions || positionInfo.positions.length === 0) {
      return `No active positions found for the account.`;
    }
    
    let response = `Active Positions (${positionInfo.positionCount}):\n\n`;
    
    positionInfo.positions.forEach((position: any, index: number) => {
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
 * Handle create position request
 */
async function handleCreatePositionRequest(instruction: string, context: HandlerContext): Promise<string> {
  try {
    const { getMarketInfo } = await import('./gmx/markets.js');
    
    // Extract position details from the message
    // In a real implementation, you would use a more sophisticated approach to extract parameters
    
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
    const marketObj = marketInfo.markets.find((m: any) => 
      m.marketInfo?.indexToken?.symbol?.toUpperCase() === market);
    
    if (!marketObj) {
      return `Market not found for ${market}. Please specify a valid market (e.g., ETH, BTC).`;
    }
    
    // Determine collateral token address
    const collateralToken = isLong ? 
      marketObj.marketInfo.longToken : 
      marketObj.marketInfo.shortToken;
      
    if (!collateralToken) {
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
  } catch (error) {
    context.log('Error handling create position request:', error);
    return 'Error processing create position request. Please try a simpler format or check your input.';
  }
}

/**
 * Handle close position request
 */
async function handleClosePositionRequest(instruction: string, context: HandlerContext): Promise<string> {
  try {
    const { getPositionInfo } = await import('./gmx/positions.js');
    
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
    
    if (!positionInfo.positions || positionInfo.positions.length === 0) {
      return `No active positions found to close.`;
    }
    
    // Look for a position in the specified market
    const position = positionInfo.positions.find((p: any) => 
      p.market.toUpperCase().includes(market));
    
    if (!position) {
      return `No active position found for ${market}. Available positions:\n` +
             positionInfo.positions.map((p: any, i: number) => `${i+1}. ${p.market} (${p.side})`).join('\n');
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

/**
 * Get help message
 */
function getHelpMessage(): string {
  return `Welcome to the GMX Agent! Here are some things you can do:

1. View available markets:
   "Show me available markets on GMX"

2. View your positions:
   "What are my current positions?"

3. Create a position:
   "Open a long ETH position with 0.1 ETH as collateral and 5x leverage"

4. Close a position:
   "Close my BTC position"

Please note that this is a no-wallet example that simulates responses. 
In a real implementation, you would need to connect a wallet to execute transactions.`;
} 