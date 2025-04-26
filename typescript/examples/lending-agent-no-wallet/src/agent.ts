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
  type TransactionRequest,
} from './agentToolHandlers.js';
import type { Task } from 'a2a-samples-js/schema';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'module';
import * as chains from 'viem/chains';
import type { Chain } from 'viem/chains';

// Node types might be needed for process.env and __dirname/__filename patterns
// import type * as NodeTypes from 'node'; // This line can be uncommented if @types/node doesn't resolve 'process'

// Create cache file path for storing tokens
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Use a different cache file name to avoid conflicts with potential swap agent cache
const CACHE_FILE_PATH = path.join(__dirname, '.cache', 'lending_capabilities.json');

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// --- Zod Schemas for MCP Capabilities ---

const ZodTokenUidSchema = z.object({
  chainId: z.string().optional(),
  address: z.string().optional(),
});

const ZodTokenSchema = z
  .object({
    symbol: z.string().optional(),
    name: z.string().optional(),
    decimals: z.number().optional(),
    tokenUid: ZodTokenUidSchema.optional(),
  })
  .passthrough(); // Allow extra fields

const ZodLendingCapabilitySchema = z
  .object({
    capabilityId: z.string().optional(),
    currentSupplyApy: z.string().optional(), // Assuming string representation
    currentBorrowApy: z.string().optional(), // Assuming string representation
    underlyingToken: ZodTokenSchema.optional(),
    maxLtv: z.string().optional(), // Assuming string representation
    liquidationThreshold: z.string().optional(), // Assuming string representation
  })
  .passthrough(); // Allow extra fields

const ZodCapabilitySchema = z
  .object({
    lendingCapability: ZodLendingCapabilitySchema.optional(),
    // Add swapCapability if needed, but focusing on lending for this agent
    // swapCapability: ZodSwapCapabilitySchema.optional(),
  })
  .passthrough(); // Allow other capability types if present

const ZodGetCapabilitiesResponseSchema = z
  .object({
    capabilities: z.array(ZodCapabilitySchema),
    // next_page_token: z.string().optional(), // If pagination is used
  })
  .passthrough(); // Allow extra fields

type McpGetCapabilitiesResponse = z.infer<typeof ZodGetCapabilitiesResponseSchema>;

// --- End Zod Schemas ---

// --- Zod Schema for MCP Text Wrapper ---
const ZodMcpTextWrapperSchema = z.object({
  content: z
    .array(
      z.object({
        type: z.literal('text'), // Ensure type is exactly 'text'
        text: z.string(), // Ensure text is a string
      })
    )
    .min(1), // Ensure the content array is not empty
});
// --- End MCP Text Wrapper Schema ---

// Define schema for token data validation (used internally in tokenMap)
const TokenInfoSchema = z.object({
  chainId: z.string(),
  address: z.string(),
  decimals: z.number(),
});

// Define schema for action inputs
const BorrowRepaySupplyWithdrawSchema = z.object({
  tokenName: z
    .string()
    .describe(
      "The symbol of the token (e.g., 'USDC', 'WETH'). Must be one of the available tokens."
    ),
  amount: z
    .string()
    .describe('The amount of the token to use, as a string representation of a number.'),
});

// Define schema for positions
const GetUserPositionsSchema = z.object({});

function logError(...args: unknown[]) {
  console.error(...args);
}

export interface AgentOptions {
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

// Define the structure for the set of lending tools
type LendingToolSet = {
  borrow: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  repay: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  supply: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  withdraw: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  getUserPositions: Tool<typeof GetUserPositionsSchema, Task>;
};

// Define ChainConfig interface for chain configurations
interface ChainConfig {
  viemChain: Chain;
  quicknodeSegment: string;
}

// Map ONLY the QuickNode segment, as viemChain is found dynamically
const quicknodeSegments: Record<string, string> = {
  '1': '',
  '42161': 'arbitrum-mainnet',
  '10': 'optimism',
  '137': 'matic',
  '8453': 'base-mainnet',
};

// Function to find the correct viem chain object and QuickNode segment
export function getChainConfigById(chainId: string): ChainConfig {
  const numericChainId = parseInt(chainId, 10);
  if (isNaN(numericChainId)) {
    throw new Error(`Invalid chainId format: ${chainId}`);
  }

  // Find the viem chain object dynamically
  const viemChain = Object.values(chains).find(
    chain => chain && typeof chain === 'object' && 'id' in chain && chain.id === numericChainId
  );

  if (!viemChain) {
    throw new Error(
      `Unsupported chainId: ${chainId}. Viem chain definition not found in imported chains.`
    );
  }

  // Look up the QuickNode segment from our specific map
  const quicknodeSegment = quicknodeSegments[chainId];

  if (quicknodeSegment === undefined) {
    throw new Error(
      `Unsupported chainId: ${chainId}. QuickNode segment not configured in quicknodeSegments map.`
    );
  }

  // Assert the type of viemChain to satisfy the linter
  return { viemChain: viemChain as Chain, quicknodeSegment };
}

export class Agent {
  private mcpClient: Client | null = null;
  private tokenMap: Record<string, Array<TokenInfo>> = {};
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;
  private availableTokens: string[] = [];
  private toolSet: LendingToolSet | null = null; // Changed from 'tools' to 'toolSet'
  public conversationHistory: CoreMessage[] = []; // Public for potential external access/logging
  private userAddress?: string; // Store user address

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;
    // Removed setupTools() call from here
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set!');
    }
  }

  /**
   * Initialize the agent by setting up the token map, MCP client, and tools.
   */
  async init(): Promise<void> {
    // Ensure MCP Client is set up *before* fetching capabilities which might use it
    this.setupMCPClient();

    // --- Add Transport Connection ---
    console.error('Initializing MCP client transport...');
    try {
      const require = createRequire(import.meta.url);
      // Assuming ember-mcp-tool-server is a dependency or resolved correctly
      const mcpToolPath = require.resolve('ember-mcp-tool-server');
      console.error(`Found MCP tool server path: ${mcpToolPath}`);

      console.error(`Connecting to MCP server at ${process.env.EMBER_ENDPOINT}`);
      const transport = new StdioClientTransport({
        command: 'node',
        args: [mcpToolPath],
        env: {
          ...process.env, // Pass existing env vars
          EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? 'grpc.api.emberai.xyz:50051',
        },
      });

      if (!this.mcpClient) {
        // Should have been set by setupMCPClient
        throw new Error('MCP Client was not initialized before attempting connection.');
      }
      await this.mcpClient.connect(transport);
      console.error('MCP client connected successfully.');
    } catch (error) {
      console.error('Failed to initialize MCP client transport or connect:', error);
      // Decide how to handle connection failure - maybe throw to prevent agent start?
      throw new Error(`MCP Client connection failed: ${(error as Error).message}`);
    }
    // --- End Transport Connection ---

    // Setup token map by fetching/parsing capabilities
    await this.setupTokenMap();

    // Set up tools using Vercel AI SDK's `tool` function
    this.toolSet = {
      borrow: tool({
        description:
          'Borrow a token. Provide the token name (e.g., USDC, WETH) and a human-readable amount.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: borrow', args);
          try {
            return await handleBorrow(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during borrow via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
      repay: tool({
        description: 'Repay a borrowed token. Provide the token name and a human-readable amount.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: repay', args);
          try {
            return await handleRepay(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during repay via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
      supply: tool({
        description:
          'Supply (deposit) a token. Provide the token name and a human-readable amount.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: supply', args);
          try {
            return await handleSupply(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during supply via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
      withdraw: tool({
        description:
          'Withdraw a previously supplied token. Provide the token name and a human-readable amount.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: withdraw', args);
          try {
            return await handleWithdraw(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during withdraw via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
      getUserPositions: tool({
        description: 'Get a summary of your current lending and borrowing positions.',
        parameters: GetUserPositionsSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: getUserPositions', args);
          try {
            return await handleGetUserPositions(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during getUserPositions via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
    };

    // Initialize conversation history with a system prompt
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an AI agent providing access to blockchain lending functionalities via Ember AI Onchain Actions.

Available actions: borrow, repay, supply, withdraw, getUserPositions.

Only use tools if the user explicitly asks to perform an action and provides the necessary parameters.
- borrow, repay, supply, withdraw require: tokenName, amount.
- getUserPositions requires no parameters.

If parameters are missing, ask the user to provide them. Do not assume parameters.

<examples>
<example1 - Borrow>
<user>Borrow 100 USDC</user>
<tool_call> {"toolName": "borrow", "args": { "tokenName": "USDC", "amount": "100" }} </tool_call>
</example1>

<example2 - Supply>
<user>I want to supply 0.5 WETH</user>
<tool_call> {"toolName": "supply", "args": { "tokenName": "WETH", "amount": "0.5" }} </tool_call>
</example2>

<example3 - Missing Amount>
<user>Repay my WBTC loan</user>
<response> How much WBTC would you like to repay? </response>
</example3>

<example4 - Get Positions>
<user>What are my current positions?</user>
<tool_call> {"toolName": "getUserPositions", "args": {}} </tool_call>
</example4>

<example5 - Clarification Needed (handled by tool)>
<user>Withdraw 10 USDC</user>
<tool_call> {"toolName": "withdraw", "args": { "tokenName": "USDC", "amount": "10" }} </tool_call>
// Tool handler will respond asking for chain if needed.
</example5>
</examples>

Always use plain text. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason. Present the user with a list of tokens/chains if clarification is needed (as handled by the tool).`,
      },
    ];
    // Log statements updated to reflect dynamic loading
    console.error('Agent initialized. Token map populated dynamically via MCP capabilities.');
    console.error('Available tokens:', this.availableTokens.join(', ') || 'None loaded');
    console.error('Tools initialized for Vercel AI SDK.');
  }

  // Add start() method for parity
  async start() {
    await this.init();
    console.error('Agent started.'); // Add log for parity
  }

  /**
   * Fetches capabilities from MCP server and caches the raw response.
   */
  private async fetchAndCacheCapabilities(): Promise<McpGetCapabilitiesResponse> {
    if (!this.mcpClient) {
      throw new Error('MCP Client not initialized. Cannot fetch capabilities.');
    }

    console.error('Fetching lending capabilities via MCP tool call...');
    try {
      // Read timeout from env var, default to 30 seconds
      const mcpTimeoutMs = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || '30000', 10);
      console.error(`Using MCP tool timeout: ${mcpTimeoutMs}ms`);

      // Use callTool to invoke the getCapabilities tool on the MCP server
      const capabilitiesResult = await this.mcpClient.callTool(
        {
          name: 'getCapabilities',
          // Provide the required 'type' argument
          arguments: { type: 'LENDING' },
        },
        undefined, // Context ID, if needed
        { timeout: mcpTimeoutMs } // Use configured timeout
      );

      console.error('Raw capabilitiesResult received from MCP tool call.');

      // --- Response Parsing: Use Zod to validate wrapper and parse nested JSON ---
      // 1. Validate the outer wrapper structure
      const wrapperValidationResult = ZodMcpTextWrapperSchema.safeParse(capabilitiesResult);

      if (!wrapperValidationResult.success) {
        logError(
          'MCP getCapabilities tool returned an unexpected structure. Zod Error:',
          JSON.stringify(wrapperValidationResult.error.format(), null, 2)
        );
        logError('Data that failed wrapper validation:', capabilitiesResult);
        throw new Error(
          'MCP getCapabilities tool returned an unexpected structure. Expected { content: [{ type: "text", text: string }] }.'
        );
      }

      // 2. Parse the nested JSON string
      const jsonString = wrapperValidationResult.data.content[0].text;
      let parsedData: any;
      try {
        console.error('Attempting to parse JSON string from content[0].text...');
        parsedData = JSON.parse(jsonString);
      } catch (parseError) {
        logError('Failed to parse JSON string from content[0].text:', parseError);
        logError('Original text content:', jsonString);
        throw new Error(
          `Failed to parse nested JSON response from getCapabilities: ${(parseError as Error).message}`
        );
      }
      // --- End Response Parsing ---

      // --- Add Head/Tail Logging (uses parsedData) ---
      const dataString = JSON.stringify(parsedData, null, 2);
      const previewLength = 500; // Log ~500 chars from head and tail
      if (dataString.length < previewLength * 2) {
        console.error('Parsed data structure before final validation:', dataString);
      } else {
        console.error(
          'Parsed data structure before final validation (Head):\n',
          dataString.substring(0, previewLength) + '\n...'
        );
        console.error(
          'Parsed data structure before final validation (Tail):\n...',
          dataString.substring(dataString.length - previewLength)
        );
      }
      // --- End Head/Tail Logging ---

      // 3. Validate the inner capabilities data structure
      const capabilitiesValidationResult = ZodGetCapabilitiesResponseSchema.safeParse(parsedData);

      if (!capabilitiesValidationResult.success) {
        // Log the detailed Zod error
        logError(
          'Parsed MCP getCapabilities response validation failed. Zod Error:',
          JSON.stringify(capabilitiesValidationResult.error.format(), null, 2)
        );
        // logError('Data that failed validation:', JSON.stringify(parsedData)); // Keep this commented unless needed
        throw new Error('Failed to validate the parsed capabilities data from MCP server tool.');
      }

      const validatedData = capabilitiesValidationResult.data;
      console.error(`Validated ${validatedData.capabilities.length} capabilities.`);

      // Cache the validated raw response if caching is enabled
      const useCache = process.env.AGENT_CACHE_TOKENS === 'true';
      if (useCache) {
        try {
          await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
          // Cache the *validated* data structure
          await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(validatedData, null, 2));
          console.error('Cached validated capabilities response to', CACHE_FILE_PATH);
        } catch (err) {
          console.error('Failed to cache capabilities response:', err);
          // Continue without cache, but log the error
        }
      }

      return validatedData;
    } catch (error) {
      logError('Error calling getCapabilities tool or processing response:', error);
      throw new Error(
        `Failed to fetch/validate capabilities via MCP tool: ${(error as Error).message}`
      );
    }
  }

  /**
   * Set up the token map with supported tokens by fetching capabilities.
   */
  private async setupTokenMap(): Promise<void> {
    let capabilitiesResponse: McpGetCapabilitiesResponse | undefined;
    const useCache = process.env.AGENT_CACHE_TOKENS === 'true';

    if (useCache) {
      try {
        await fs.access(CACHE_FILE_PATH); // Check if cache file exists
        console.error('Loading lending capabilities from cache...');
        const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
        const parsedJson = JSON.parse(cachedData);
        // Validate cached data
        const validationResult = ZodGetCapabilitiesResponseSchema.safeParse(parsedJson);
        if (validationResult.success) {
          capabilitiesResponse = validationResult.data;
          console.error('Cached capabilities loaded and validated successfully.');
        } else {
          logError('Cached capabilities validation failed:', validationResult.error);
          logError('Cached data that failed validation:', JSON.stringify(parsedJson));
          console.error('Proceeding to fetch fresh capabilities...');
        }
      } catch (error) {
        // Handle file access error (ENOENT) or JSON parse error
        if (
          error instanceof Error &&
          (error.message.includes('ENOENT') || error instanceof SyntaxError)
        ) {
          console.error('Cache not found or invalid, fetching fresh capabilities...');
        } else {
          logError('Error reading or parsing cache file:', error);
          // Decide if we should proceed or throw? For now, proceed to fetch.
          console.error('Proceeding to fetch fresh capabilities despite cache read error...');
        }
      }
    }

    // Fetch fresh capabilities if not loaded from cache
    if (!capabilitiesResponse) {
      try {
        capabilitiesResponse = await this.fetchAndCacheCapabilities();
      } catch (fetchError) {
        logError('Failed to fetch capabilities, token map will be empty:', fetchError);
        // Initialize empty maps/arrays to prevent errors later
        this.tokenMap = {};
        this.availableTokens = [];
        return; // Exit setup if fetching failed critically
      }
    }

    // Process the capabilities to populate the token map
    this.tokenMap = {}; // Reset map
    this.availableTokens = []; // Reset available token symbols list
    let loadedTokenCount = 0;
    let processedCapabilityCount = 0;

    if (capabilitiesResponse?.capabilities) {
      console.error(
        `Processing ${capabilitiesResponse.capabilities.length} capabilities entries...`
      );
      capabilitiesResponse.capabilities.forEach((capabilityEntry, index) => {
        if (capabilityEntry.lendingCapability) {
          processedCapabilityCount++;
          const lendingCap = capabilityEntry.lendingCapability;
          const token = lendingCap.underlyingToken;

          // Check if the token details are sufficient
          if (token && token.symbol && token.tokenUid?.chainId && token.tokenUid?.address) {
            const symbol = token.symbol;
            const tokenInfo: TokenInfo = {
              chainId: token.tokenUid.chainId,
              address: token.tokenUid.address,
              decimals: token.decimals ?? 18, // Default to 18 if missing
            };

            // Check if the symbol exists in the map
            if (!this.tokenMap[symbol]) {
              // If not, initialize the array and add the symbol to availableTokens
              this.tokenMap[symbol] = [tokenInfo];
              this.availableTokens.push(symbol);
              loadedTokenCount++;
              // console.error(`  - Added first entry for token: ${symbol} (Chain: ${tokenInfo.chainId}, Addr: ${tokenInfo.address})`);
            } else {
              // If symbol exists, push the new definition onto the array
              // Avoid adding exact duplicates (same chain, same address)
              const exists = this.tokenMap[symbol].some(
                t =>
                  t.chainId === tokenInfo.chainId &&
                  t.address.toLowerCase() === tokenInfo.address.toLowerCase()
              );
              if (!exists) {
                this.tokenMap[symbol].push(tokenInfo);
                // console.error(`  - Appended entry for token: ${symbol} (Chain: ${tokenInfo.chainId}, Addr: ${tokenInfo.address})`);
              } else {
                // console.error(`  - Skipping duplicate entry for token: ${symbol} (Chain: ${tokenInfo.chainId}, Addr: ${tokenInfo.address})`);
              }
            }
          } else {
            // console.error(`  - Skipping capability index ${index}: Missing token details (symbol, chainId, address)`);
          }
        } else {
          // console.error(`  - Skipping capability index ${index}: Not a lendingCapability`);
        }
      });
      console.error(
        `Finished processing capabilities. Processed ${processedCapabilityCount} lending capabilities. Found ${loadedTokenCount} unique token symbols.`
      );
    } else {
      logError('No capabilities array found in the response, token map will be empty.');
    }

    // Final check
    if (Object.keys(this.tokenMap).length === 0) {
      console.warn('Warning: Token map is empty after processing capabilities.');
    }
  }

  /**
   * Set up the MCP client
   */
  private setupMCPClient(): void {
    if (!this.mcpClient) {
      this.mcpClient = new Client({ name: 'LendingAgentNoWallet', version: '1.0.0' });
      console.error('MCP Client initialized.');
    }
  }

  /**
   * Process a user input message using Vercel AI SDK
   */
  async processUserInput(userMessageText: string, userAddress: string): Promise<Task> {
    if (!this.toolSet) {
      throw new Error('Agent not initialized. Call init() first.');
    }
    this.userAddress = userAddress; // Store user address for context

    const userMessage: CoreUserMessage = { role: 'user', content: userMessageText };
    this.conversationHistory.push(userMessage);

    try {
      console.error('Calling generateText with Vercel AI SDK...');
      const { response, text, finishReason } = await generateText({
        model: openrouter('google/gemini-2.5-flash-preview'), // Or your preferred model
        messages: this.conversationHistory,
        tools: this.toolSet,
        maxSteps: 5, // Limit steps to prevent potential loops
        onStepFinish: async (stepResult: StepResult<typeof this.toolSet>) => {
          console.error(`Step finished. Reason: ${stepResult.finishReason}`);
        },
      });
      console.error(`generateText finished. Reason: ${finishReason}`);

      // Log message flow for debugging
      response.messages.forEach((msg, index) => {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          msg.content.forEach(part => {
            if (part.type === 'tool-call') {
              console.error(
                `[LLM Request ${index}]: Tool Call - ${part.toolName} with args ${JSON.stringify(part.args)}`
              );
            }
          });
        } else if (msg.role === 'tool') {
          if (Array.isArray(msg.content)) {
            msg.content.forEach((toolResult: ToolResultPart) => {
              console.error(`[Tool Result ${index} for ${toolResult.toolName} received]`);
            });
          }
        } else if (msg.role === 'assistant') {
          console.error(`[LLM Response ${index}]: ${msg.content}`);
        }
      });

      this.conversationHistory.push(...response.messages);

      // Find the Task result from the tool messages
      let finalTask: Task | null = null;
      for (const message of response.messages) {
        if (message.role === 'tool' && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (
              part.type === 'tool-result' &&
              part.result &&
              typeof part.result === 'object' &&
              'id' in part.result
            ) {
              console.error(`Processing tool result for ${part.toolName} from response.messages`);
              finalTask = part.result as Task; // Assume the result IS the Task
              console.error(`Task Result State: ${finalTask?.status?.state ?? 'N/A'}`);
              const firstPart = finalTask?.status?.message?.parts[0];
              const messageText = firstPart && firstPart.type === 'text' ? firstPart.text : 'N/A';
              console.error(`Task Result Message: ${messageText}`);
              break; // Found the task from the most recent tool call
            }
          }
        }
        if (finalTask) break; // Stop searching once a task is found
      }

      if (finalTask) {
        // If a task was completed, failed, or canceled, clear history for next interaction
        if (['completed', 'failed', 'canceled'].includes(finalTask.status.state)) {
          console.error(
            `Task finished with state ${finalTask.status.state}. Clearing conversation history.`
          );
          this.conversationHistory = [];
        }
        return finalTask;
      }

      // If no tool was called and no task was returned, return the assistant's text response
      console.error('No tool called or task found, returning text response.');
      return {
        id: this.userAddress,
        status: {
          state: 'completed', // Or another appropriate state
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: text || "I'm sorry, I couldn't process that request." }],
          },
        },
      };
    } catch (error) {
      const errorLog = `Error calling Vercel AI SDK generateText: ${error}`;
      logError(errorLog);
      const errorAssistantMessage: CoreAssistantMessage = {
        role: 'assistant',
        content: `An error occurred: ${String(error)}`,
      };
      this.conversationHistory.push(errorAssistantMessage);
      // Return a Task indicating failure
      return {
        id: this.userAddress ?? 'unknown',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `An error occurred: ${String(error)}` }],
          },
        },
      };
    }
  }

  /**
   * Return the context required by handler functions
   */
  private getHandlerContext(): HandlerContext {
    return {
      mcpClient: this.mcpClient!,
      tokenMap: this.tokenMap,
      userAddress: this.userAddress,
      log: console.error,
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
      executeAction: this.executeAction.bind(this),
    };
  }

  /**
   * Execute an action that involves sending transactions via MCP
   * (Kept from original, may need adjustment based on how MCP tasks are handled)
   */
  async executeAction(
    actionName: string,
    transactions: TransactionRequest[]
  ): Promise<TransactionRequest[]> {
    // This method is called by the tool handlers.
    // It needs to return the transactions for the MCP server to execute.
    console.error(
      `Agent preparing ${transactions.length} transaction(s) for action: ${actionName}`
    );
    // In this no-wallet agent, we don't sign/send. We just return the prepared transactions.
    return transactions;
  }

  /**
   * Format numeric values consistently
   * (Kept from original as it's specific business logic)
   */
  private formatNumeric(
    value: string | number | undefined,
    minDecimals = 2,
    maxDecimals = 2
  ): string {
    if (value === undefined) return 'N/A';
    try {
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(num)) return 'N/A';

      // Handle very small numbers that might show in scientific notation
      if (Math.abs(num) < 1e-6 && num !== 0) {
        return num.toExponential(maxDecimals);
      }

      return num.toLocaleString(undefined, {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
      });
    } catch (e) {
      console.error(`Error formatting numeric value: ${value}`, e);
      return 'N/A';
    }
  }
}
