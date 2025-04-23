import { CapabilitiesExceedingMaximum } from 'a2a-samples-js';
import type { Capabilities } from 'a2a-samples-js';
import { ethers } from 'ethers';
import { setupGmxClient } from './gmx/client.js';
import { getPositionInfo } from './gmx/positions.js';
import { createDecreasePosition, createIncreasePosition } from './gmx/orders.js';
import { getMarketInfo } from './gmx/markets.js';

/**
 * GMX Agent class that integrates with MCP and GMX protocol
 */
export class Agent {
  private provider: ethers.providers.Provider;
  private gmxClient: any; // GMX client type

  constructor() {
    // Initialize blockchain provider
    const rpcUrl = process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc';
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Initialize the agent
   */
  async init(): Promise<void> {
    // Initialize GMX client
    await this.initializeGmxClient();
  }

  /**
   * Initialize the GMX client
   */
  private async initializeGmxClient() {
    try {
      this.gmxClient = await setupGmxClient();
      console.log('GMX client initialized successfully');
    } catch (error) {
      console.error('Error initializing GMX client:', error);
      throw new Error('Failed to initialize GMX client');
    }
  }

  /**
   * Handle user chat messages
   */
  public async handleChat(userMessage: string): Promise<string> {
    try {
      console.log(`Processing user message: ${userMessage}`);
      
      // For this example, we'll use a simple pattern matching approach
      // In a real implementation, you might use a more sophisticated NLP approach
      const lowerMessage = userMessage.toLowerCase();
      
      // Show markets
      if (lowerMessage.includes('markets') || lowerMessage.includes('available') || lowerMessage.includes('show')) {
        return await this.handleMarketsQuery();
      }
      
      // Show positions
      else if (lowerMessage.includes('positions') || lowerMessage.includes('my position')) {
        return await this.handlePositionsQuery();
      }
      
      // Create position
      else if ((lowerMessage.includes('create') || lowerMessage.includes('open') || lowerMessage.includes('long') || lowerMessage.includes('short')) 
              && (lowerMessage.includes('position') || lowerMessage.includes('trade'))) {
        return await this.handleCreatePositionRequest(userMessage);
      }
      
      // Close position
      else if ((lowerMessage.includes('close') || lowerMessage.includes('decrease') || lowerMessage.includes('exit')) 
              && lowerMessage.includes('position')) {
        return await this.handleClosePositionRequest(userMessage);
      }
      
      // General help
      else {
        return this.getHelpMessage();
      }
    } catch (error) {
      console.error('Error processing chat:', error);
      if (error instanceof CapabilitiesExceedingMaximum) {
        return 'Your request is too complex. Please try a simpler request related to GMX positions or markets.';
      }
      return `Sorry, I encountered an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Handle markets query
   */
  private async handleMarketsQuery(): Promise<string> {
    try {
      const marketInfo = await this.getMarketInfo();
      
      if (!marketInfo.success) {
        return `Failed to fetch market information: ${marketInfo.message}`;
      }
      
      let response = `Available GMX Markets (${marketInfo.marketCount}):\n\n`;
      
      marketInfo.markets.forEach((market: any, index: number) => {
        const marketName = market.marketInfo?.indexToken?.symbol 
          ? `${market.marketInfo.indexToken.symbol}/USD` 
          : 'Unknown Market';
          
        response += `${index + 1}. ${marketName}\n`;
        response += `   Long Token: ${market.marketInfo?.longToken?.symbol || 'Unknown'}\n`;
        response += `   Short Token: ${market.marketInfo?.shortToken?.symbol || 'Unknown'}\n\n`;
      });
      
      return response;
    } catch (error) {
      console.error('Error handling markets query:', error);
      return 'Error fetching market information. Please try again later.';
    }
  }

  /**
   * Handle positions query
   */
  private async handlePositionsQuery(): Promise<string> {
    try {
      // Use a demo account address if one is provided in .env, otherwise use a placeholder
      const demoAccount = process.env.DEMO_ACCOUNT || '0x0000000000000000000000000000000000000000';
      
      const positionInfo = await this.getPositionInfo(demoAccount);
      
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
      console.error('Error handling positions query:', error);
      return 'Error fetching position information. Please try again later.';
    }
  }

  /**
   * Handle create position request
   */
  private async handleCreatePositionRequest(userMessage: string): Promise<string> {
    try {
      // Extract position details from the message
      // In a real implementation, you would use a more sophisticated approach to extract parameters
      
      // Detect if it's a long or short
      const isLong = userMessage.toLowerCase().includes('long') || !userMessage.toLowerCase().includes('short');
      const side = isLong ? 'LONG' : 'SHORT';
      
      // Try to extract market (e.g., ETH, BTC)
      const marketMatches = userMessage.match(/\b(ETH|BTC|LINK|UNI|ARB|SOL|AVAX)\b/i);
      const market = marketMatches ? marketMatches[0].toUpperCase() : 'ETH';
      
      // Try to extract collateral amount
      const amountMatches = userMessage.match(/\b([\d.]+)\s*(ETH|BTC|LINK|UNI|ARB|SOL|AVAX|USD|USDC|USDT)\b/i);
      const amount = amountMatches ? amountMatches[1] : '0.1';
      const collateralType = (amountMatches && amountMatches[2]) ? amountMatches[2].toUpperCase() : market;
      
      // Try to extract leverage
      const leverageMatches = userMessage.match(/\b(\d+)x\b/i);
      const leverage = leverageMatches && leverageMatches[1] ? parseInt(leverageMatches[1]) : 2;
      
      // Get market information to find the market address
      const marketInfo = await this.getMarketInfo();
      if (!marketInfo.success) {
        return `Failed to fetch market information: ${marketInfo.message}`;
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
      console.error('Error handling create position request:', error);
      return 'Error processing create position request. Please try a simpler format or check your input.';
    }
  }

  /**
   * Handle close position request
   */
  private async handleClosePositionRequest(userMessage: string): Promise<string> {
    try {
      // Try to extract market (e.g., ETH, BTC)
      const marketMatches = userMessage.match(/\b(ETH|BTC|LINK|UNI|ARB|SOL|AVAX)\b/i);
      const market = marketMatches ? marketMatches[0].toUpperCase() : 'ETH';
      
      // Use a demo account address if one is provided in .env, otherwise use a placeholder
      const demoAccount = process.env.DEMO_ACCOUNT || '0x0000000000000000000000000000000000000000';
      
      // Get position information to check if the position exists
      const positionInfo = await this.getPositionInfo(demoAccount);
      
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
      console.error('Error handling close position request:', error);
      return 'Error processing close position request. Please try a simpler format or check your input.';
    }
  }

  /**
   * Get help message
   */
  private getHelpMessage(): string {
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

  /**
   * Methods for GMX operations
   */
  public async getPositionInfo(account: string): Promise<any> {
    return getPositionInfo(this.gmxClient, account);
  }

  public async createIncreasePosition(params: any): Promise<any> {
    return createIncreasePosition(this.gmxClient, params);
  }

  public async createDecreasePosition(params: any): Promise<any> {
    return createDecreasePosition(this.gmxClient, params);
  }

  public async getMarketInfo(): Promise<any> {
    return getMarketInfo(this.gmxClient);
  }
} 