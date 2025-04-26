import { ethers } from 'ethers';
import { setupGmxClient } from './gmx/client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { HandlerContext } from './agentToolHandlers.js';
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
import type { Task } from 'a2a-samples-js/schema';

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
  userAddress: z.string()
    // .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe('Required. User address starting with "0x". Example: 0x1234567890abcdef1234567890abcdef12345678.'),
  marketSymbol: z.string()
    .optional()
    .describe('Optional. Specific market symbol to filter positions by (e.g., "ETH", "BTC").'),
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
 * GMX Agent class that integrates with MCP and GMX protocol
 */
export class Agent {
  private provider: ethers.providers.Provider;
  private gmxClient: GmxSdk | null = null;
  private mcpClient: Client | null = null;
  public conversationHistory: CoreMessage[] = [];
  private toolSet: GmxToolSet | null = null;
  private userAddress?: string; // Store user address

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
        content: `
    You are an AI assistant specialized in trading operations on the GMX platform.
    
    You have access to the following tools:
    - getMarketInfo: Retrieve information about available GMX markets and trading pairs.
    - getPositionInfo: Retrieve open positions for a user by wallet address.
    - createIncreasePosition: Open or increase a position (simulated; no real wallet interaction).
    - createDecreasePosition: Decrease or close a position (simulated; no real wallet interaction).
    
    GENERAL BEHAVIOR:
    - Communicate clearly, professionally, and using plain text only (no markdown).
    - Always check if a tool should be called instead of replying manually.
    - When a tool is required, DO NOT reply with text — trigger the tool immediately.
    
    POSITION QUERIES:
    - If the user asks about their positions or mentions a wallet address (0x followed by 40 hex characters), you MUST call getPositionInfo.
    - Never answer manually for position queries.
    
    MARKET INFORMATION QUERIES:
    - If the user asks about available markets, funding rates, token pairs, or fees, use getMarketInfo.
    
    CREATING OR MODIFYING A POSITION (HIGHLY IMPORTANT):

    When the user requests information about a market, such as:
    Get me the market info for BTC
    Get me the market info for ETH
    Get me the market info for SOL
    Get me the market info for ARB
    Get me the market info for LINK
    Get me the market info for UNI

    You MUST call getMarketInfo with the token symbol (e.g., "BTC", "ETH") extracted from the user's request and ignore the user address.
    You MUST NOT call getPositionInfo with the user address.
    
    When the user requests creating, opening, closing, increasing, decreasing, buying, selling, longing, or shorting a position:
    
    1. FIRST call getMarketInfo with the token symbol (e.g., "BTC", "ETH") extracted from the user's request.
    2. WAIT for getMarketInfo to successfully return market addresses.
    3. IMMEDIATELY AFTER getMarketInfo, you MUST call one of:
       - createIncreasePosition (for open/create/long/buy/increase types of requests)
       - createDecreasePosition (for close/exit/sell/short/decrease types of requests)
    
    USE THE EXACT ADDRESSES FROM getMarketInfo:
    - marketAddress → from getMarketInfo.marketAddress
    - collateralTokenAddress → choose longTokenAddress or shortTokenAddress depending on LONG/SHORT
    
    CLASSIFY THE ACTION BASED ON KEYWORDS:
    - "open", "create", "buy", "long" → createIncreasePosition
    - "close", "sell", "exit", "short", "decrease" → createDecreasePosition
    
    OUTPUT RULES:
    - Never stop after just calling getMarketInfo — you must proceed to call the position tool.
    - Never guess token addresses manually. Always use getMarketInfo results.
    - Never respond with text if a tool action is required.
    
    EXAMPLES:
    
    Example 1:
    User: "Open a 10x long position on BTC using 0.01 ETH"
    Action:
    - getMarketInfo("BTC")
    - Use returned addresses to call createIncreasePosition
    
    Example 2:
    User: "Close my short position on ETH"
    Action:
    - getMarketInfo("ETH")
    - Use returned addresses to call createDecreasePosition
    
    ERROR HANDLING:
    - If a tool call fails, explain briefly and encourage the user to retry.
    - Never guess missing data. Ask users for missing parameters if necessary.
    
    REMEMBER:
    - Prefer tool calls over freeform text responses.
    - Always maintain the chain: getMarketInfo → action (increase/decrease).
        `,
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
            console.log('Vercel AI SDK calling handler: getMarketInfo tool', args);
            try {
              const response = await handleMarketsQuery(args,this.getHandlerContext());
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
            console.log('Vercel AI SDK calling handler: getPositionInfo tool', args);
            try {
              const response = await handlePositionsQuery(args, this.getHandlerContext());
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
            console.log('Vercel AI SDK calling handler: createIncreasePosition tool', args);
            try {
              const response = await handleCreatePositionRequest(args, this.getHandlerContext());
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
            console.log('Vercel AI SDK calling handler: createDecreasePosition tool', args);
            try {
              const response = await handleClosePositionRequest(args, this.getHandlerContext());
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

    this.userAddress = userAddress; // Store user address for context

    this.log(`Processing user message: ${userInput} for address: ${userAddress}`);
      
    // Add user message to conversation history
    if(this.userAddress){
      userInput = `User address: ${this.userAddress}\n${userInput}`;
    }
    
    const userMessage: CoreUserMessage = { role: 'user', content: userInput };
    this.conversationHistory.push(userMessage);

    try {
      this.log('Calling generateText with Vercel AI SDK...');
      const { response, text, finishReason } = await generateText({
        model: openrouter('gpt-4o'),
        messages: this.conversationHistory,
        tools: this.toolSet,
        maxSteps: 10,
        onStepFinish: async (stepResult) => {
          this.log(`Step finished. Reason: ${stepResult.finishReason}`);
        },
      });
      this.log(`generateText finished. Reason: ${finishReason}`);

      response.messages.forEach((msg, index) => {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          msg.content.forEach(part => {
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

      // --- Process Tool Results from response.messages ---
      let processedToolResult: Task | null = null;
      for (const message of response.messages) {
        if (message.role === 'tool' && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'tool-result' && 
                ['getMarketInfo', 'getPositionInfo', 'createIncreasePosition', 'createDecreasePosition'].includes(part.toolName)) {
              this.log(`Processing tool result for ${part.toolName} from response.messages`);
              // Log the raw result for debugging
              //this.log(`Raw toolResult.result: ${JSON.stringify(part.result)}`);
              // Assert the type
              processedToolResult = part.result as Task;
              // Now you can safely access properties based on the asserted type
              this.log(`${part.toolName} Result State: ${processedToolResult?.status?.state ?? 'N/A'}`);
              // Check if the first part is a text part before accessing .text
              const firstPart = processedToolResult?.status?.message?.parts[0];
              const messageText = firstPart && firstPart.type === 'text' ? firstPart.text : 'N/A';
              this.log(`${part.toolName} Result Message: ${messageText}`);
              // Break if you only expect one result or handle multiple if needed
              break;
            }
          }
        }
        if (processedToolResult) break; // Exit outer loop once result is found
      }
      // --- End Process Tool Results ---

      if (!processedToolResult) {
        console.log('No processedToolResult found');
        throw new Error(text);
      }

      switch (processedToolResult.status.state) {
        case 'completed':
        case 'failed':
        case 'canceled':
          // Important to clear the conversation history after a Task has finished
          this.conversationHistory = [];
          return processedToolResult;
        case 'input-required':
        case 'submitted':
        case 'working':
        case 'unknown':
          return processedToolResult;
      }
    } catch (error) {
      const errorLog = `Error calling Vercel AI SDK generateText: ${error}`;
      logError(errorLog);
      const errorAssistantMessage: CoreAssistantMessage = {
        role: 'assistant',
        content: `An error occurred: ${String(error)}`,
      };
      this.conversationHistory.push(errorAssistantMessage);
      throw error;
    }
  }
}
