import { ethers } from 'ethers';
import { setupGmxClient } from './gmx/client.js';
import { getPositionInfo } from './gmx/positions.js';
import { createDecreasePosition, createIncreasePosition } from './gmx/orders.js';
import { getMarketInfo } from './gmx/markets.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { HandlerContext } from './agentToolHandlers.js';
import { handleGmxQuery } from './agentToolHandlers.js';
import type { Task } from 'a2a-samples-js/schema';

type TextPart = { type: 'text'; text: string };

function isTextPart(part: any): part is TextPart {
  return part && part.type === 'text' && typeof part.text === 'string';
}

/**
 * GMX Agent class that integrates with MCP and GMX protocol
 */
export class Agent {
  private provider: ethers.providers.Provider;
  private gmxClient: any; // GMX client type
  private mcpClient: Client | null = null;

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
   * Get handler context
   */
  private getHandlerContext(): HandlerContext {
    return {
      gmxClient: this.gmxClient,
      provider: this.provider,
      mcpClient: this.mcpClient as Client,
      log: this.log,
    };
  }

  /**
   * Log function
   */
  log(...args: unknown[]) {
    console.error(...args);
  }

  /**
   * Process user input and return a Task
   * This matches the pattern from swapping-agent-no-wallet
   */
  public async processUserInput(userInput: string, userAddress: string): Promise<Task> {
    try {
      console.log(`Processing user message: ${userInput} for address: ${userAddress}`);
      
      // Pass the user input to the GMX query handler
      return await handleGmxQuery(
        { 
          instruction: userInput,
          userAddress
        },
        this.getHandlerContext()
      );
    } catch (error) {
      console.error('Error processing user input:', error);
      
      // Return a failed task with error message
      return {
        id: `gmx-error-${Date.now()}`,
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
   * Handle user chat messages (legacy method)
   */
  public async handleChat(userMessage: string): Promise<string> {
    try {
      console.log(`Processing user message: ${userMessage}`);
      
      const task = await handleGmxQuery(
        { instruction: userMessage },
        this.getHandlerContext()
      );
      
      // Check the task state and return appropriate response
      if (task.status.state === 'completed' && task.status.message) {
        const messageParts = task.status.message.parts;
        if (messageParts && messageParts.length > 0) {
          const part = messageParts[0];
          if (isTextPart(part)) {
            return part.text;
          }
        }
      }
      
      // If we can't extract a valid response, return error
      if (task.status.state === 'failed' && task.status.message) {
        const messageParts = task.status.message.parts;
        if (messageParts && messageParts.length > 0) {
          const part = messageParts[0];
          if (isTextPart(part)) {
            return part.text;
          }
        }
        return `Failed to process your request: ${task.status.state}`;
      }
      
      return `Unknown response state: ${task.status.state}`;
    } catch (error) {
      console.error('Error processing chat:', error);
      return `Sorry, I encountered an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Methods for GMX operations that can be used by handlers
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