import { ethers } from 'ethers';
import { setupGmxClient } from './gmx/client.js';
import { getPositionInfo } from './gmx/positions.js';
import { createDecreasePosition, createIncreasePosition } from './gmx/orders.js';
import { getMarketInfo } from './gmx/markets.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { HandlerContext } from './agentToolHandlers.js';
import { handleGmxQuery } from './agentToolHandlers.js';
import type { Task } from 'a2a-samples-js/schema';
import {
  generateText,
  tool,
  type Tool,
  type CoreMessage,
  type ToolResultPart,
  type CoreUserMessage,
  type CoreAssistantMessage,
  type StepResult,
} from 'ai';
import { createRequire } from 'module';
import { z } from 'zod';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

type TextPart = { type: 'text'; text: string };

function isTextPart(part: any): part is TextPart {
  return part && part.type === 'text' && typeof part.text === 'string';
}

// Define schema for GMX query
const GmxQuerySchema = z.object({
  instruction: z
    .string()
    .describe("A natural‑language directive for GMX operations, e.g. 'Show me ETH markets on GMX'."),
  userAddress: z
    .string()
    .optional()
    .describe('The user wallet address which would be used for positions or transactions.'),
});
type GmxQueryArgs = z.infer<typeof GmxQuerySchema>;

/**
 * Log error function
 */
function logError(...args: unknown[]) {
  console.error(...args);
}

type GmxToolSet = {
  gmxQuery: Tool<typeof GmxQuerySchema, Awaited<ReturnType<typeof handleGmxQuery>>>;
};

/**
 * GMX Agent class that integrates with MCP and GMX protocol
 */
export class Agent {
  private provider: ethers.providers.Provider;
  private gmxClient: any; // GMX client type
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
        gmxQuery: tool({
          description: 'Query the GMX protocol for market information, positions, and other data.',
          parameters: GmxQuerySchema,
          execute: async (args: GmxQueryArgs) => {
            this.log('Vercel AI SDK calling handler: gmxQuery', args);
            try {
              return await handleGmxQuery(
                args,
                this.getHandlerContext()
              );
            } catch (error: any) {
              logError(`Error during gmxQuery via toolSet: ${error.message}`);
              throw error;
            }
          },
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
          onStepFinish: async (stepResult: StepResult<typeof this.toolSet>) => {
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
              if (part.type === 'tool-result' && part.toolName === 'gmxQuery') {
                this.log(`Processing tool result for ${part.toolName} from response.messages`);
                processedToolResult = part.result as Task;
                this.log(`GMX Query Result State: ${processedToolResult?.status?.state ?? 'N/A'}`);
                break;
              }
            }
          }
          if (processedToolResult) break;
        }

        if (!processedToolResult) {
          throw new Error(text);
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
        }

      // Fallback: directly call the handler if OpenRouter is not configured
      return await handleGmxQuery(
        { 
          instruction: userInput,
          userAddress
        },
        this.getHandlerContext()
      );
    } catch (error) {
      console.error('Error processing user input:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorAssistantMessage: CoreAssistantMessage = {
        role: 'assistant',
        content: String(errorMessage),
      };
      this.conversationHistory.push(errorAssistantMessage);
      
      // Return a failed task with error message
      return {
        id: `gmx-error-${Date.now()}`,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ 
              type: 'text', 
              text: `Error: ${errorMessage}`
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