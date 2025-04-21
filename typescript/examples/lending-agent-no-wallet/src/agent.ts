import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import {
  handleBorrow,
  handleRepay,
  handleSupply,
  handleWithdraw,
  handleGetUserPositions,
  agentTools,
  type HandlerContext,
  type TokenInfo,
  type TransactionRequest,
} from './agentToolHandlers.js';
import type { Task } from 'a2a-samples-js/schema';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Create cache file path for storing tokens
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, ".cache", "lending_tokens.json");

// Zod schema for token data validation
const TokenInfoSchema = z.object({
  chainId: z.string(),
  address: z.string(),
  decimals: z.number(),
});

// Define schema for action inputs
const BorrowRepaySupplyWithdrawSchema = z.object({
  tokenName: z.string().describe("The symbol of the token (e.g., 'USDC', 'WETH'). Must be one of the available tokens."),
  amount: z.string().describe("The amount of the token to use, as a string representation of a number."),
});

// Define schema for positions 
const GetUserPositionsSchema = z.object({});

// Message types from wallet implementation
type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

// Define the different types of message content
interface TextPart {
  type: 'text';
  text: string;
}

interface ToolCallPart {
  type: 'tool-call';
  toolName: string;
  toolCallId: string;
  args: Record<string, any>;
}

interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: any;
  isError: boolean;
}

type MessagePart = TextPart | ToolCallPart | ToolResultPart;
type MessageContent = string | MessagePart[];

interface CoreMessage {
  role: MessageRole;
  content: MessageContent;
}

function logError(...args: unknown[]) {
  console.error(...args);
}

export interface AgentOptions {
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

// Tool schemas for structured input processing
type ToolHandler = (params: any, context: HandlerContext) => Promise<Task>;

interface Tool {
  name: string;
  description: string;
  schema: z.ZodType<any>;
  handler: ToolHandler;
}

export class Agent {
  private mcpClient: Client | null = null;
  private tokenMap: Record<string, TokenInfo> = {};
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;
  private availableTokens: string[] = [];
  private tools: Record<string, Tool> = {};
  private conversationHistory: CoreMessage[] = [];

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;
    this.setupTools();
  }

  /**
   * Set up the available tools with schemas and handlers
   */
  private setupTools(): void {
    // Register available tools with handlers
    this.tools = {
      borrow: {
        name: 'borrow',
        description: 'Borrow a token. Provide the token name (e.g., USDC, WETH) and a human-readable amount.',
        schema: BorrowRepaySupplyWithdrawSchema,
        handler: handleBorrow,
      },
      repay: {
        name: 'repay',
        description: 'Repay a borrowed token. Provide the token name and a human-readable amount.',
        schema: BorrowRepaySupplyWithdrawSchema,
        handler: handleRepay,
      },
      supply: {
        name: 'supply',
        description: 'Supply (deposit) a token. Provide the token name and a human-readable amount.',
        schema: BorrowRepaySupplyWithdrawSchema, 
        handler: handleSupply,
      },
      withdraw: {
        name: 'withdraw',
        description: 'Withdraw a previously supplied token. Provide the token name and a human-readable amount.',
        schema: BorrowRepaySupplyWithdrawSchema,
        handler: handleWithdraw,
      },
      getUserPositions: {
        name: 'getUserPositions',
        description: 'Get a summary of your current lending and borrowing positions.',
        schema: GetUserPositionsSchema,
        handler: handleGetUserPositions,
      },
    };
  }

  /**
   * Initialize the agent by setting up the token map and MCP client
   */
  async init(): Promise<void> {
    await this.setupTokenMap();
    this.setupMCPClient();
    this.conversationHistory = [
      { 
        role: 'system', 
        content: 'You are an assistant that provides access to blockchain lending and borrowing functionalities. Always use plain text. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason.' 
      }
    ];
    console.error("Agent initialized with", Object.keys(this.tokenMap).length, "tokens");
    console.error("Available tokens:", Object.keys(this.tokenMap).join(", "));
  }

  /**
   * Set up the token map with supported tokens
   */
  private async setupTokenMap(): Promise<void> {
    // Try to load cached token data first
    const useCache = process.env.AGENT_CACHE_TOKENS === 'true';
    if (useCache) {
      try {
        const cachedData = await fs.readFile(CACHE_FILE_PATH, "utf-8");
        const parsedTokens = JSON.parse(cachedData);
        const validTokenMap: Record<string, TokenInfo> = {};
        
        // Validate each token
        for (const [symbol, tokenData] of Object.entries(parsedTokens)) {
          try {
            const validToken = TokenInfoSchema.parse(tokenData);
            validTokenMap[symbol] = validToken;
          } catch (err) {
            console.error(`Invalid token data for ${symbol}:`, err);
          }
        }
        
        if (Object.keys(validTokenMap).length > 0) {
          this.tokenMap = validTokenMap;
          this.availableTokens = Object.keys(this.tokenMap);
          console.error("Loaded tokens from cache:", this.availableTokens.length);
          return;
        }
      } catch (err) {
        console.error("Failed to load tokens from cache, using default tokens:", err);
      }
    }
    
    // Fall back to default hard-coded token definitions
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
      WBTC: {
        chainId: '42161', // Arbitrum
        address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        decimals: 8,
      },
    };
    
    this.availableTokens = Object.keys(this.tokenMap);
    
    // Cache token data for future use
    if (useCache) {
      try {
        await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
        await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(this.tokenMap, null, 2));
        console.error("Cached token map for future use");
      } catch (err) {
        console.error("Failed to cache token map:", err);
      }
    }
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

    // Add user message to conversation history
    this.conversationHistory.push({ role: 'user', content: userMessage });

    // Create a context object that will be passed to all handlers
    const context: HandlerContext = {
      mcpClient: this.mcpClient,
      tokenMap: this.tokenMap,
      userAddress,
      log: console.error,
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
      executeAction: this.executeAction.bind(this),
      describeWalletPositionsResponse: this.describeWalletPositionsResponse.bind(this),
    };

    try {
      // Process message through our structured AI-like flow
      const { finalAssistantMessage } = await this.callSimulatedLLMWithTools(context, userAddress);
      
      if (finalAssistantMessage && typeof finalAssistantMessage.content === 'string') {
        // Add assistant's text response to history
        return this.createTextResponse(userAddress, finalAssistantMessage.content);
      } else if (finalAssistantMessage) {
        // Look for a task in the response content
        const task = this.extractTaskFromMessage(finalAssistantMessage);
        if (task) {
          return task;
        }
      }
      
      // Fallback if we couldn't determine the intent or no response
      return this.createHelpResponse(userAddress);
    } catch (error) {
      logError('Error processing request:', error);
      return {
        id: userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ 
              type: 'text', 
              text: `Error: ${(error as Error).message}` 
            }],
          },
        },
      };
    }
  }

  /**
   * Create a simple text response Task
   */
  private createTextResponse(userAddress: string, text: string, state: 'completed' | 'failed' | 'input-required' = 'completed'): Task {
    return {
      id: userAddress,
      status: {
        state,
        message: {
          role: 'agent',
          parts: [{ type: 'text', text }],
        },
      },
    };
  }

  /**
   * Extract task from a message if it contains one
   */
  private extractTaskFromMessage(message: CoreMessage): Task | null {
    if (Array.isArray(message.content)) {
      // Look for a task in the content array
      for (const part of message.content) {
        if (part.type === 'tool-result' && part.result && typeof part.result === 'object' && 'id' in part.result) {
          return part.result as Task;
        }
      }
    }
    return null;
  }

  /**
   * Process the message through our tools in a way that mimics LLM tool calls
   */
  private async callSimulatedLLMWithTools(context: HandlerContext, userAddress: string, maxToolRoundtrips = 2): Promise<{ nextMessages: CoreMessage[], finalAssistantMessage: CoreMessage | null }> {
    let currentMessages = [...this.conversationHistory];
    let finalAssistantMessage: CoreMessage | null = null;

    for (let i = 0; i < maxToolRoundtrips; i++) {
      try {
        // Simulate what an LLM would do by analyzing the last user message
        const userMessage = this.getLastUserMessage(currentMessages);
        
        // First check for simple informational requests
        const intent = this.detectSimpleIntents(userMessage);
        
        if (intent === 'tokens') {
          // Create a direct text response for token listing
          const assistantMessage: CoreMessage = { 
            role: 'assistant', 
            content: `Available tokens for lending/borrowing: ${this.availableTokens.join(', ')}` 
          };
          currentMessages.push(assistantMessage);
          finalAssistantMessage = assistantMessage;
          break;
        }

        // Try to extract a tool call from the message
        const toolCall = await this.parseToolCall(userMessage);
        
        // If we found a potential tool call
        if (toolCall) {
          const { toolName, args } = toolCall;
          
          // Create a simulated assistant message with tool call
          const toolCallId = `call-${Date.now()}`;
          const assistantMessage: CoreMessage = { 
            role: 'assistant', 
            content: [
              { type: 'text', text: '' }, // Empty text as we're doing a tool call
              { 
                type: 'tool-call', 
                toolCallId, 
                toolName, 
                args 
              } as ToolCallPart
            ]
          };
          currentMessages.push(assistantMessage);

          // Find the tool and execute it
          if (this.tools[toolName]) {
            const tool = this.tools[toolName];
            
            try {
              // Validate args against the tool's schema
              const validatedArgs = tool.schema.parse(args);
              
              // Execute the tool
              const toolResult = await tool.handler(validatedArgs, context);
              
              // Create a tool response message
              const toolResultMessage: CoreMessage = {
                role: 'tool',
                content: [
                  { 
                    type: 'tool-result', 
                    toolCallId, 
                    toolName, 
                    result: toolResult,
                    isError: false 
                  } as ToolResultPart
                ]
              };
              currentMessages.push(toolResultMessage);
              
              // Create a final assistant message with the result
              let responseText = "Action completed successfully.";
              
              // Extract the text from Task's message parts if available
              if (toolResult.status?.message?.parts && 
                  Array.isArray(toolResult.status.message.parts) && 
                  toolResult.status.message.parts.length > 0 &&
                  toolResult.status.message.parts[0].type === 'text') {
                responseText = toolResult.status.message.parts[0].text;
              }
              
              const finalMessage: CoreMessage = { 
                role: 'assistant', 
                content: responseText 
              };
              currentMessages.push(finalMessage);
              finalAssistantMessage = finalMessage;
              
              // Store the Task as a property on the final message for easy retrieval
              (finalAssistantMessage as any).task = toolResult;
              
              break;
            } catch (validationError) {
              // Handle validation errors
              logError('Tool argument validation error:', validationError);
              
              const errorMessage: CoreMessage = {
                role: 'tool',
                content: [
                  { 
                    type: 'tool-result', 
                    toolCallId, 
                    toolName, 
                    result: `Error: ${(validationError as Error).message}`,
                    isError: true 
                  } as ToolResultPart
                ]
              };
              currentMessages.push(errorMessage);
              
              // Create a final error response
              const errorResponse: CoreMessage = { 
                role: 'assistant', 
                content: `I couldn't process your request because of an error: ${(validationError as Error).message}. Please check your input and try again.` 
              };
              currentMessages.push(errorResponse);
              finalAssistantMessage = errorResponse;
              break;
            }
          } else {
            // Tool not found
            const errorMessage: CoreMessage = {
              role: 'tool',
              content: [
                { 
                  type: 'tool-result', 
                  toolCallId, 
                  toolName: toolName || 'unknown', 
                  result: `Error: Unknown tool "${toolName}"`,
                  isError: true 
                } as ToolResultPart
              ]
            };
            currentMessages.push(errorMessage);
            
            const errorResponse: CoreMessage = { 
              role: 'assistant', 
              content: `I'm not sure what action you want to perform. Please try rephrasing your request.` 
            };
            currentMessages.push(errorResponse);
            finalAssistantMessage = errorResponse;
            break;
          }
        } else {
          // No tool call detected, create a help message
          const helpMessage: CoreMessage = { 
            role: 'assistant', 
            content: this.getHelpMessage() 
          };
          currentMessages.push(helpMessage);
          finalAssistantMessage = helpMessage;
          break;
        }
      } catch (error) {
        logError("Error in tool processing flow:", error);
        const errorMessage: CoreMessage = { 
          role: "assistant", 
          content: `Sorry, an error occurred while processing your request: ${(error as Error).message}` 
        };
        currentMessages.push(errorMessage);
        finalAssistantMessage = errorMessage;
        break;
      }
    }

    return { nextMessages: currentMessages, finalAssistantMessage };
  }

  /**
   * Helper to get the last user message from the conversation
   */
  private getLastUserMessage(messages: CoreMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'user') {
        if (typeof message.content === 'string') {
          return message.content;
        } else if (Array.isArray(message.content)) {
          // Try to extract text from parts if content is an array
          for (const part of message.content) {
            if (part.type === 'text' && part.text) {
              return part.text;
            }
          }
        }
      }
    }
    return '';
  }

  /**
   * Detect simple informational intents without regex
   */
  private detectSimpleIntents(message: string): 'tokens' | 'positions' | null {
    const lowercaseMsg = message.toLowerCase();
    
    // Check for token listing
    const tokenKeywords = ['tokens', 'available', 'list', 'what tokens', 'supported'];
    if (tokenKeywords.some(keyword => lowercaseMsg.includes(keyword))) {
      return 'tokens';
    }
    
    // Check for positions - handled as a tool call
    const positionKeywords = ['position', 'balance', 'check', 'show me', 'what do i have'];
    if (positionKeywords.some(keyword => lowercaseMsg.includes(keyword))) {
      return 'positions';
    }
    
    return null;
  }

  /**
   * Parse the user message into a structured tool call
   * This is a simpler version of what an LLM would do
   */
  private async parseToolCall(message: string): Promise<{ toolName: string; args: any } | null> {
    const lowercaseMsg = message.toLowerCase();

    // Check for borrow intent
    if (lowercaseMsg.includes('borrow')) {
      const args = this.extractTokenAndAmount(lowercaseMsg);
      if (args) {
        return { toolName: 'borrow', args };
      }
    }
    
    // Check for repay intent
    if (lowercaseMsg.includes('repay')) {
      const args = this.extractTokenAndAmount(lowercaseMsg);
      if (args) {
        return { toolName: 'repay', args };
      }
    }
    
    // Check for supply/deposit intent
    if (lowercaseMsg.includes('supply') || lowercaseMsg.includes('deposit')) {
      const args = this.extractTokenAndAmount(lowercaseMsg);
      if (args) {
        return { toolName: 'supply', args };
      }
    }
    
    // Check for withdraw intent
    if (lowercaseMsg.includes('withdraw')) {
      const args = this.extractTokenAndAmount(lowercaseMsg);
      if (args) {
        return { toolName: 'withdraw', args };
      }
    }
    
    // Check for positions intent
    if (this.detectSimpleIntents(message) === 'positions') {
      return { toolName: 'getUserPositions', args: {} };
    }
    
    return null;
  }

  /**
   * Extract token name and amount from a message using NLP-style parsing
   * This avoids regex by using tokenization and entity extraction patterns
   */
  private extractTokenAndAmount(message: string): { tokenName: string; amount: string } | null {
    // Tokenize the string by whitespace
    const tokens = message.split(/\s+/);
    
    // Look for potential amounts (numbers) in the tokens
    let amountIndex = -1;
    let amount = '';
    
    for (let i = 0; i < tokens.length; i++) {
      // Parse numbers like "100" or "0.5"
      if (/^\d+(\.\d+)?$/.test(tokens[i])) {
        amountIndex = i;
        amount = tokens[i];
        break;
      }
    }
    
    // If we found an amount, check the next token as a potential token name
    if (amountIndex >= 0 && amountIndex + 1 < tokens.length) {
      const potentialToken = tokens[amountIndex + 1].toUpperCase();
      
      // Verify it's a valid token by checking if it exists in availableTokens
      if (this.availableTokens.includes(potentialToken)) {
        return { 
          tokenName: potentialToken, 
          amount: amount 
        };
      }
      
      // If not found directly, check case-insensitive
      const matchedToken = this.availableTokens.find(
        token => token.toLowerCase() === potentialToken.toLowerCase()
      );
      
      if (matchedToken) {
        return { 
          tokenName: matchedToken, 
          amount: amount 
        };
      }
    }
    
    return null;
  }

  /**
   * Get standard help message text
   */
  private getHelpMessage(): string {
    return `I'm not sure what you want to do. You can:
1. Borrow tokens (e.g., "Borrow 100 USDC") 
2. Repay borrowed tokens (e.g., "Repay 50 DAI")
3. Supply tokens as collateral (e.g., "Supply 0.5 ETH")
4. Withdraw supplied tokens (e.g., "Withdraw 1000 USDC")
5. Check your positions (e.g., "Show my positions")
6. List available tokens (e.g., "What tokens are available?")`;
  }

  /**
   * Create a help response when intent is unclear
   */
  private createHelpResponse(userAddress: string): Task {
    const message = this.getHelpMessage();
    
    // Add response to conversation history
    this.conversationHistory.push({ role: 'assistant', content: message });
    
    return {
      id: userAddress,
      status: {
        state: 'input-required',
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
    };
  }

  /**
   * No-wallet implementation: we prepare the transaction data but don't execute it
   */
  async executeAction(
    actionName: string,
    transactions: TransactionRequest[]
  ): Promise<TransactionRequest[]> {
    // Just return the transactions for frontend handling
    return Promise.resolve(transactions);
  }

  /**
   * Format user position data into a readable string
   */
  describeWalletPositionsResponse(response: any): string {
    if (!response || !response.positions || response.positions.length === 0) {
      return "You currently have no active lending or borrowing positions.";
    }

    let output = "Your current positions:\n";
    
    for (const position of response.positions) {
      if (position.positionType === 'LENDING' && position.lendingPosition) {
        output += "--------------------\n";
        const format = (val: string | undefined) => this.formatNumeric(val ?? '0');
        
        if (position.lendingPosition.netWorthUsd) {
          output += `Net Worth: $${format(position.lendingPosition.netWorthUsd)}\n`;
        }
        
        if (position.lendingPosition.healthFactor) {
          output += `Health Factor: ${this.formatNumeric(position.lendingPosition.healthFactor, 4)}\n`;
        }
        
        if (position.lendingPosition.totalLiquidityUsd) {
          output += `Total Supplied: $${format(position.lendingPosition.totalLiquidityUsd)}\n`;
        }
        
        if (position.lendingPosition.totalCollateralUsd) {
          output += `Total Collateral: $${format(position.lendingPosition.totalCollateralUsd)}\n`;
        }
        
        if (position.lendingPosition.totalBorrowsUsd) {
          output += `Total Borrows: $${format(position.lendingPosition.totalBorrowsUsd)}\n\n`;
        }

        // Handle supplied assets
        const deposits = position.lendingPosition.userReserves?.filter(
          (entry: any) => parseFloat(entry.underlyingBalance ?? '0') > 1e-6
        ) || [];
        
        if (deposits.length > 0) {
          output += "Supplied Assets:\n";
          for (const entry of deposits) {
            const underlyingUSD = entry.underlyingBalanceUsd 
              ? `$${this.formatNumeric(entry.underlyingBalanceUsd)}` 
              : "N/A";
            output += `- ${entry.token?.symbol || 'Unknown'}: ${this.formatNumeric(entry.underlyingBalance)} (${underlyingUSD})${entry.isCollateral ? ' (Collateral)' : ''}\n`;
          }
        }

        // Handle borrowed assets
        const loans = position.lendingPosition.userReserves?.filter(
          (entry: any) => parseFloat(entry.totalBorrows ?? "0") > 1e-6
        ) || [];
        
        if (loans.length > 0) {
          output += "\nBorrowed Assets:\n";
          for (const entry of loans) {
            const totalBorrowsUSD = entry.totalBorrowsUsd 
              ? `$${this.formatNumeric(entry.totalBorrowsUsd)}` 
              : "N/A";
            const borrowRate = entry.variableBorrowRate 
              ? `${this.formatNumeric(parseFloat(entry.variableBorrowRate) * 100)}% APR` 
              : '';
            output += `- ${entry.token?.symbol || 'Unknown'}: ${this.formatNumeric(entry.totalBorrows || "0")} (${totalBorrowsUSD}) ${borrowRate}\n`;
          }
        }
      }
    }
    
    return output.trim();
  }

  /**
   * Format numeric values with appropriate precision
   */
  private formatNumeric(value: string | number | undefined, minDecimals = 2, maxDecimals = 2): string {
    if (value === undefined || value === null) return "N/A";
    
    let num: number;
    if (typeof value === 'string') {
      try {
        num = parseFloat(value);
      } catch (e) {
        return "N/A";
      }
    } else {
      num = value;
    }

    if (isNaN(num)) return "N/A";

    try {
      return num.toLocaleString(undefined, {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
      });
    } catch (e) {
      return num.toFixed(maxDecimals);
    }
  }
} 