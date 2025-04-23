import { ethers } from 'ethers';
import { setupGmxClient } from './gmx/client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { HandlerContext, Task } from './agentToolHandlers.js';
import { handleMarketsQuery, handlePositionsQuery, handleCreatePositionRequest, handleClosePositionRequest } from './agentToolHandlers.js';
import {
  generateText,
  tool,
  type Tool,
  type CoreMessage,
  type ToolResultPart,
  type CoreUserMessage,
  type CoreAssistantMessage,
} from 'ai';
import { createRequire } from 'module';
import { z } from 'zod';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { GmxSdk } from '@gmx-io/sdk';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

type TextPart = { type: 'text'; text: string };

function isTextPart(part: any): part is TextPart {
  return part && part.type === 'text' && typeof part.text === 'string';
}

// Define schema for GMX tools
const GetMarketInfoSchema = z.object({
  marketSymbol: z.string().optional().describe('Specific market symbol to query (e.g., "ETH", "BTC"). If not provided, returns all markets.'),
});

const GetPositionInfoSchema = z.object({
  userAddress: z.string().optional().describe('User wallet address to check positions for. If not provided, uses demo account.'),
  marketSymbol: z.string().optional().describe('Specific market to filter positions for (e.g., "ETH", "BTC")'),
});

const CreateIncreasePositionSchema = z.object({
  marketAddress: z.string().describe('The market address to create a position in'),
  side: z.enum(['LONG', 'SHORT']).describe('Position side (LONG or SHORT)'),
  collateralTokenAddress: z.string().describe('The address of the collateral token'),
  collateralAmount: z.string().describe('The amount of collateral to use'),
  leverage: z.number().describe('The leverage to use for the position'),
  slippage: z.number().optional().describe('Allowed slippage in basis points (50 = 0.5%)'),
});

const CreateDecreasePositionSchema = z.object({
  marketAddress: z.string().describe('The market address of the position to decrease'),
  collateralTokenAddress: z.string().describe('The address of the collateral token'),
  collateralAmount: z.string().describe('The amount of collateral to withdraw'),
  isClosePosition: z.boolean().describe('Whether to completely close the position'),
  slippage: z.number().optional().describe('Allowed slippage in basis points (50 = 0.5%)'),
});

// Define a record type to avoid specific typings
type GmxToolSet = Record<string, any>;

/**
 * Log error function
 */
function logError(...args: unknown[]) {
  console.error(...args);
}

/**
 * Create a task response helper
 */
function createTaskResponse(success: boolean, message: string): Task {
  return {
    id: `gmx-${success ? 'success' : 'error'}-${Date.now()}`,
    status: {
      state: success ? 'completed' : 'failed',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: message }]
      }
    }
  };
}

/**
 * GMX Agent class that integrates with MCP and GMX protocol
 */
export class Agent {
  private provider: ethers.providers.Provider;
  private gmxClient: GmxSdk | null = null;
  private mcpClient: Client | null = null;
  public conversationHistory: CoreMessage[] = [];
  private toolSet: GmxToolSet | null = null;

  constructor() {
    // Initialize blockchain provider
    const rpcUrl = process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc';
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Initialize the agent
   */
  async init(): Promise<void> {
    // Set up conversation history with a system prompt
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an AI agent that provides access to GMX protocol operations. You can help users view market information, check position details, and provide guidance on trading strategies.

You understand and can respond to queries about:
- GMX markets and pairs
- Current position information
- Trading strategies on GMX
- Liquidation risks and margin requirements
- Fee structures and funding rates

You have access to the following tools:
- getMarketInfo: Get information about available markets on GMX
- getPositionInfo: Check position details for a user
- createIncreasePosition: Create or increase a position (simulated)
- createDecreasePosition: Decrease or close a position (simulated)

Use plain text in your responses, not markdown. Be concise and accurate with numbers and data. When you encounter an error, clearly explain what went wrong without guessing at the cause.`,
      },
    ];

    // Initialize GMX client
    await this.initializeGmxClient();

    // Initialize MCP client via stdio
    this.log('Initializing MCP client via stdio...');
    try {
      this.mcpClient = new Client(
        { name: 'GmxAgent', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      if (process.env.EMBER_ENDPOINT) {
        const require = createRequire(import.meta.url);
        let mcpToolPath: string;
        
        try {
          mcpToolPath = require.resolve('ember-mcp-tool-server');
          this.log(`Found ember-mcp-tool-server at ${mcpToolPath}`);
        } catch (error) {
          this.log('ember-mcp-tool-server not found, skipping MCP client setup');
          mcpToolPath = '';
        }
        
        if (mcpToolPath) {
          this.log(`Connecting to MCP server at ${process.env.EMBER_ENDPOINT}`);
          
          const transport = new StdioClientTransport({
            command: 'node',
            args: [mcpToolPath],
            env: {
              ...process.env,
              EMBER_ENDPOINT: process.env.EMBER_ENDPOINT,
            },
          });
          
          await this.mcpClient.connect(transport);
          this.log('MCP client initialized successfully.');
        }
      } else {
        this.log('EMBER_ENDPOINT not set, skipping MCP client setup');
      }

      // Set up the Vercel AI SDK toolSet
      this.toolSet = {
        getMarketInfo: tool({
          description: 'Get information about available markets on GMX',
          parameters: GetMarketInfoSchema,
          execute: async (args) => {
            this.log('Executing getMarketInfo tool', args);
            try {
              const response = await handleMarketsQuery(this.getHandlerContext());
              return response;
            } catch (error: any) {
              logError(`Error executing getMarketInfo:`, error);
              throw error;
            }
          }
        }),
        
        getPositionInfo: tool({
          description: 'Check position details for a user',
          parameters: GetPositionInfoSchema,
          execute: async (args) => {
            this.log('Executing getPositionInfo tool', args);
            try {
              // Construct an instruction that includes any filters
              let instruction = `Show my positions`;
              if (args.marketSymbol) {
                instruction += ` for ${args.marketSymbol}`;
              }
              if (args.userAddress) {
                instruction += ` for account ${args.userAddress}`;
              }
              
              const response = await handlePositionsQuery(instruction, this.getHandlerContext());
              return response;
            } catch (error: any) {
              logError(`Error executing getPositionInfo:`, error);
              throw error;
            }
          }
        }),
        
        createIncreasePosition: tool({
          description: 'Create or increase a position (simulated in this no-wallet example)',
          parameters: CreateIncreasePositionSchema,
          execute: async (args) => {
            this.log('Executing createIncreasePosition tool', args);
            try {
              // Construct an instruction from the parameters
              const instruction = `Create a ${args.leverage}x ${args.side} position for market ${args.marketAddress} with ${args.collateralAmount} collateral`;
              
              const response = await handleCreatePositionRequest(instruction, this.getHandlerContext());
              return response;
            } catch (error: any) {
              logError(`Error executing createIncreasePosition:`, error);
              throw error;
            }
          }
        }),
        
        createDecreasePosition: tool({
          description: 'Decrease or close a position (simulated in this no-wallet example)',
          parameters: CreateDecreasePositionSchema,
          execute: async (args) => {
            this.log('Executing createDecreasePosition tool', args);
            try {
              // Construct an instruction from the parameters
              const action = args.isClosePosition ? 'Close' : 'Decrease';
              const instruction = `${action} position for market ${args.marketAddress} ${args.isClosePosition ? 'completely' : `by ${args.collateralAmount}`}`;
              
              const response = await handleClosePositionRequest(instruction, this.getHandlerContext());
              return response;
            } catch (error: any) {
              logError(`Error executing createDecreasePosition:`, error);
              throw error;
            }
          }
        }),
      };
    } catch (error) {
      logError('Failed during agent initialization:', error);
      throw new Error('Agent initialization failed. Cannot proceed.');
    }

    this.log('Agent initialized successfully.');
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
    if (!this.gmxClient) {
      throw new Error('GMX client not initialized');
    }

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
  async log(...args: unknown[]) {
    console.error(...args);
  }

  /**
   * Process user input and return a Task
   * This matches the pattern from swapping-agent-no-wallet
   */
  public async processUserInput(userInput: string, userAddress: string): Promise<Task> {
    if (!this.toolSet) {
      throw new Error('Agent not initialized. Call init() first.');
    }

    try {
      this.log(`Processing user message: ${userInput} for address: ${userAddress}`);
      
      // Add user message to conversation history
      const userMessage: CoreUserMessage = { role: 'user', content: userInput };
      this.conversationHistory.push(userMessage);

      this.log('Calling generateText with Vercel AI SDK...');
      const { response, text, finishReason } = await generateText({
        model: openrouter('google/gemini-2.5-flash-preview'),
        messages: this.conversationHistory,
        tools: this.toolSet,
        maxSteps: 10,
        onStepFinish: async (stepResult) => {
          this.log(`Step finished. Reason: ${stepResult.finishReason}`);
        },
      });
      this.log(`generateText finished. Reason: ${finishReason}`);

      response.messages.forEach((msg: any, index: number) => {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          msg.content.forEach((part: any) => {
            if (part.type === 'tool-call') {
              this.log(`[LLM Request ${index}]: Tool Call - ${part.toolName}`);
            }
          });
        } else if (msg.role === 'tool') {
          if (Array.isArray(msg.content)) {
            msg.content.forEach((toolResult: ToolResultPart) => {
              this.log(`[Tool Result ${index} for ${toolResult.toolName} received]`);
            });
          }
        }
      });

      this.conversationHistory.push(...response.messages);

      // Process Tool Results from response.messages
      let processedToolResult: Task | null = null;
      for (const message of response.messages) {
        if (message.role === 'tool' && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'tool-result') {
              this.log(`Processing tool result for ${part.toolName} from response.messages`);
              processedToolResult = part.result as Task;
              this.log(`Tool Result State: ${processedToolResult?.status?.state ?? 'N/A'}`);
              break;
            }
          }
        }
        if (processedToolResult) break;
      }

      if (!processedToolResult) {
        // No tool was called, use the text response as is
        return createTaskResponse(true, text);
      }

      switch (processedToolResult.status.state) {
        case 'completed':
        case 'failed':
        case 'canceled':
          this.conversationHistory = [];
          return processedToolResult;
        case 'input-required':
        case 'submitted':
        case 'working':
        case 'unknown':
          return processedToolResult;
        default:
          return createTaskResponse(false, `Unknown tool result state: ${processedToolResult.status.state}`);
      }
    } catch (error) {
      console.error('Error processing user input:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorAssistantMessage: CoreAssistantMessage = {
        role: 'assistant',
        content: String(errorMessage),
      };
      this.conversationHistory.push(errorAssistantMessage);
      
      // Return a failed task with error message
      return createTaskResponse(false, `Error: ${errorMessage}`);
    }
  }
}