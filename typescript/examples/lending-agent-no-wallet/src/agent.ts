import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import {
  handleBorrow,
  handleRepay,
  handleSupply,
  handleWithdraw,
  handleGetUserPositions,
  type HandlerContext,
  type TokenInfo,
} from './agentToolHandlers.js';
import type { Task } from 'a2a-samples-js/schema';

export interface AgentOptions {
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

export class Agent {
  private mcpClient: Client | null = null;
  private tokenMap: Record<string, TokenInfo> = {};
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;
  }

  /**
   * Initialize the agent by setting up the token map and MCP client
   */
  async init(): Promise<void> {
    await this.setupTokenMap();
    this.setupMCPClient();
  }

  /**
   * Set up the token map with supported tokens
   */
  private async setupTokenMap(): Promise<void> {
    // Example token map - should be replaced with actual token info
    this.tokenMap = {
      DAI: {
        chainId: '42161', // Arbitrum
        address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        decimals: 18,
      },
      USDC: {
        chainId: '42161', // Arbitrum
        address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        decimals: 6,
      },
      USDT: {
        chainId: '42161', // Arbitrum
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6,
      },
      ETH: {
        chainId: '42161', // Arbitrum
        address: '0x0000000000000000000000000000000000000000',
        decimals: 18,
      },
      WETH: {
        chainId: '42161', // Arbitrum
        address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        decimals: 18,
      },
    };
  }

  /**
   * Set up the MCP client
   */
  private setupMCPClient(): void {
    this.mcpClient = new Client(
      { name: 'LendingAgent', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
  }

  /**
   * Process a user input message
   */
  async processUserInput(userMessage: string, userAddress: string): Promise<Task> {
    if (!this.mcpClient) {
      throw new Error('Agent not initialized. Call init() first.');
    }

    // Create a context object that will be passed to all handlers
    const context: HandlerContext = {
      mcpClient: this.mcpClient,
      tokenMap: this.tokenMap,
      userAddress,
      log: console.error,
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
    };

    // Step 1: Parse the user message using an LLM to determine the intent
    // For this example, we use a simplified parsing approach with regex
    // In a real implementation, you would use an LLM for better understanding

    // Detect user intent - this is where you would integrate with an LLM in a full implementation
    const intent = this.detectIntent(userMessage);
    
    try {
      if (intent.action === 'borrow') {
        return handleBorrow({ tokenName: intent.token, amount: intent.amount }, context);
      } else if (intent.action === 'repay') {
        return handleRepay({ tokenName: intent.token, amount: intent.amount }, context);
      } else if (intent.action === 'supply' || intent.action === 'deposit') {
        return handleSupply({ tokenName: intent.token, amount: intent.amount }, context);
      } else if (intent.action === 'withdraw') {
        return handleWithdraw({ tokenName: intent.token, amount: intent.amount }, context);
      } else if (intent.action === 'positions') {
        return handleGetUserPositions({}, context);
      } else {
        // If intent couldn't be determined, return a message asking for clarification
        return {
          id: userAddress,
          status: {
            state: 'input-required',
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `I'm not sure what you want to do. You can borrow, repay, supply, or withdraw tokens, or check your positions. For example, try "Borrow 100 USDC" or "Check my positions".`,
                },
              ],
            },
          },
        };
      }
    } catch (error) {
      console.error('Error processing request:', error);
      return {
        id: userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          },
        },
      };
    }
  }

  /**
   * Simple intent detection function - in a real implementation, this would use an LLM
   */
  private detectIntent(message: string): {
    action: 'borrow' | 'repay' | 'supply' | 'deposit' | 'withdraw' | 'positions' | 'unknown';
    token: string;
    amount: string;
  } {
    message = message.toLowerCase();
    
    // Check for balance/positions check
    if (
      message.includes('position') ||
      message.includes('balance') ||
      message.includes('check') ||
      message.includes('show me') ||
      message.includes('what do i have')
    ) {
      return { action: 'positions', token: '', amount: '' };
    }
    
    // Check for borrow action
    const borrowMatch = message.match(/borrow\s+([0-9.]+)\s+([a-z]+)/i);
    if (borrowMatch) {
      return { action: 'borrow', amount: borrowMatch[1], token: borrowMatch[2] };
    }
    
    // Check for repay action
    const repayMatch = message.match(/repay\s+([0-9.]+)\s+([a-z]+)/i);
    if (repayMatch) {
      return { action: 'repay', amount: repayMatch[1], token: repayMatch[2] };
    }
    
    // Check for supply/deposit action
    const supplyMatch = message.match(/(supply|deposit)\s+([0-9.]+)\s+([a-z]+)/i);
    if (supplyMatch) {
      return { 
        action: supplyMatch[1].toLowerCase() as 'supply' | 'deposit', 
        amount: supplyMatch[2], 
        token: supplyMatch[3] 
      };
    }
    
    // Check for withdraw action
    const withdrawMatch = message.match(/withdraw\s+([0-9.]+)\s+([a-z]+)/i);
    if (withdrawMatch) {
      return { action: 'withdraw', amount: withdrawMatch[1], token: withdrawMatch[2] };
    }
    
    // If no patterns match, return unknown intent
    return { action: 'unknown', token: '', amount: '' };
  }
} 