import { ethers } from 'ethers';
import { z } from 'zod';
import {
  HandlerContext,
  TransactionPlan,
  TransactionPlanSchema,
  handleSwapTokens,
} from './agentToolHandlers.js';
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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '.cache', 'swap_capabilities.json');

// --- Zod Schemas for Vercel AI SDK Tools ---
const SwapTokensSchema = z.object({
  fromToken: z.string().describe('The symbol of the token to swap from.'),
  toToken: z.string().describe('The symbol of the token to swap to.'),
  amount: z.string().describe('The amount of the token to swap.'),
});
type SwapTokensArgs = z.infer<typeof SwapTokensSchema>;

const GetUserPositionsSchema = z.object({});
type GetUserPositionsArgs = z.infer<typeof GetUserPositionsSchema>;

// --- Zod Schemas for MCP Tool Responses ---

// Define McpCapabilityTokenSchema FIRST to reflect nesting
const McpCapabilityTokenSchema = z
  .object({
    symbol: z.string().optional(),
    name: z.string().optional(), // Added name for completeness
    decimals: z.number().optional(), // Added decimals
    tokenUid: z // Expect nested tokenUid object
      .object({
        chainId: z.string().optional(),
        address: z.string().optional(),
      })
      .optional(),
    // Add other token properties if needed based on server definition (e.g., iconUri)
  })
  .passthrough(); // Allow unknown fields

// Define McpCapabilitySchema SECOND
const McpCapabilitySchema = z
  .object({
    protocol: z.string().optional(), // Example property, adjust as needed
    capabilityId: z.string().optional(), // Added capabilityId
    supportedTokens: z.array(McpCapabilityTokenSchema).optional(), // UPDATED: look for supportedTokens
    // Add other capability properties if needed
  })
  .passthrough();

// Schema for the individual capability objects found within the capabilities array
// Define McpSingleCapabilityEntrySchema SECOND, using McpCapabilitySchema
const McpSingleCapabilityEntrySchema = z
  .object({
    // Define known capability types explicitly. Add others (e.g., bridgeCapability) if they exist.
    swapCapability: McpCapabilitySchema.optional(),
    // Add other capability types like 'bridgeCapability' here if needed
    // Example: bridgeCapability: McpBridgeCapabilitySchema.optional(),
  })
  .passthrough(); // Allow other unknown fields within each capability entry

const McpGetCapabilitiesResponseSchema = z.object({
  // UPDATED: Expect an array of capability entries
  capabilities: z.array(McpSingleCapabilityEntrySchema).optional(),
  // Add other response properties if needed
});
// Infer the type for static use
type McpGetCapabilitiesResponse = z.infer<typeof McpGetCapabilitiesResponseSchema>;

// --- End Zod Schemas ---

// Use console.error for all internal logging to avoid interfering with stdio transport
function logError(...args: unknown[]) {
  console.error(...args);
}

// --- Define the ToolSet Type using ReturnType/Awaited ---
// This extracts the *resolved* type from the Promise returned by the handler
type swappingToolSet = {
  swapTokens: Tool<typeof SwapTokensSchema, Awaited<ReturnType<typeof handleSwapTokens>>>;
};

export class Agent {
  private signer: ethers.Signer;
  private userAddress: string;
  private tokenMap: Record<
    string,
    {
      chainId: string;
      address: string;
      decimals: number;
    }
  > = {};
  private availableTokens: string[] = [];
  public conversationHistory: CoreMessage[] = [];
  private mcpClient: Client | null = null;
  // Use the specific swappingToolSet type again
  private toolSet: swappingToolSet | null = null;

  constructor(signer: ethers.Signer, userAddress: string) {
    this.signer = signer;
    this.userAddress = userAddress;
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set!');
    }
  }

  // Use console.error for all internal logging
  async log(...args: unknown[]) {
    console.error(...args); // Changed from console.log to console.error
  }

  // Helper to create context for handlers/execute methods
  private getHandlerContext(): HandlerContext {
    if (!this.mcpClient) {
      throw new Error('MCP Client not initialized!');
    }
    return {
      mcpClient: this.mcpClient,
      tokenMap: this.tokenMap,
      userAddress: this.userAddress,
      executeAction: this.executeAction.bind(this),
      log: this.log.bind(this),
    };
  }

  async init() {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an assistant that provides access to blockchain swapping functionalities via Ember SDK. Never respond in markdown, always use plain text. Never add links to your response. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason.`,
      },
    ];

    let swapCapabilities: McpGetCapabilitiesResponse | undefined;
    const useCache = process.env.AGENT_DEBUG === 'true';

    this.log('Initializing MCP client via stdio...');
    try {
      // Initialize MCP Client
      this.mcpClient = new Client(
        { name: 'SwappingAgent', version: '1.0.0' },
        // Provide empty capabilities initially, they might be discovered later
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      const transport = new StdioClientTransport({
        command: 'node',
        // Adjust path as necessary
        args: ['../../../typescript/mcp-tools/emberai-mcp/dist/index.js'],
      });

      await this.mcpClient.connect(transport);
      this.log('MCP client initialized successfully.');

      // Check for cached capabilities
      if (useCache) {
        try {
          await fs.access(CACHE_FILE_PATH);
          this.log('Loading swap capabilities from cache...');
          const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
          const parsedJson = JSON.parse(cachedData);
          // --- Reverted: Validate directly ---
          const validationResult = McpGetCapabilitiesResponseSchema.safeParse(parsedJson);
          if (validationResult.success) {
            swapCapabilities = validationResult.data; // Assign the validated data
            this.log('Cached capabilities loaded and validated successfully.');
          } else {
            logError('Cached capabilities validation failed:', validationResult.error);
            // Log what failed validation
            logError('Data that failed validation:', JSON.stringify(parsedJson));
            this.log('Proceeding to fetch fresh capabilities...');
            // Fall through to fetch fresh capabilities
          }
        } catch (error) {
          // Log specific cache access/parsing errors vs validation errors
          if (error instanceof Error && error.message.includes('invalid JSON')) {
            logError('Error reading or parsing cache file:', error);
          } else {
            this.log('Cache not found or invalid, fetching capabilities via MCP...');
          }
          // Fall through to fetch fresh capabilities
        }
      }

      // Fetch if cache was not used, invalid, or validation failed
      if (!swapCapabilities) {
        this.log('Fetching swap capabilities via MCP...');
        swapCapabilities = await this.fetchAndCacheCapabilities(); // This should return the inner structure now
      }

      // Process the capabilities array - swapCapabilities should now always have the inner structure
      // Keep the log statement here for verification
      this.log(
        'swapCapabilities before processing (first 10 lines):',
        swapCapabilities
          ? JSON.stringify(swapCapabilities, null, 2).split('\n').slice(0, 10).join('\n')
          : 'undefined'
      );
      if (swapCapabilities?.capabilities) {
        this.tokenMap = {};
        this.availableTokens = [];
        // Iterate through the array of capability entries
        swapCapabilities.capabilities.forEach(capabilityEntry => {
          // Check if this entry is a swap capability
          if (capabilityEntry.swapCapability) {
            const swapCap = capabilityEntry.swapCapability; // Use the nested swapCapability
            // Iterate through supportedTokens
            swapCap.supportedTokens?.forEach(token => {
              // Access nested properties via tokenUid
              if (token.symbol && token.tokenUid?.chainId && token.tokenUid?.address) {
                if (!this.tokenMap[token.symbol]) {
                  // Avoid duplicates if multiple protocols offer the same token
                  this.tokenMap[token.symbol] = {
                    chainId: token.tokenUid.chainId, // Use nested chainId
                    address: token.tokenUid.address, // Use nested address
                    decimals: token.decimals ?? 18,
                  };
                  this.availableTokens.push(token.symbol);
                }
              }
            });
          }
          // Add checks for other capability types (e.g., capabilityEntry.bridgeCapability) if needed
        });
        this.log('Available Tokens Loaded Internally:', this.availableTokens);
      } else {
        logError(
          'Failed to parse capabilities or no capabilities array found:',
          swapCapabilities ? 'No capabilities array' : 'Invalid capabilities data'
        );
        this.log('Warning: Could not load available tokens from MCP server.');
      }

      this.toolSet = {
        swapTokens: tool({
          description: 'Swap or convert tokens. Requires the fromToken, toToken, and amount.',
          parameters: SwapTokensSchema,
          execute: async args => {
            this.log('Vercel AI SDK calling handler: swapTokens', args);
            try {
              return await handleSwapTokens(args, this.getHandlerContext());
            } catch (error: any) {
              logError(`Error during swapTokens via toolSet: ${error.message}`);
              return `Error during swapTokens: ${error.message}`;
            }
          },
        }),
      };
    } catch (error) {
      logError('Failed during agent initialization:', error);
      throw new Error('Agent initialization failed. Cannot proceed.');
    }

    this.log('Agent initialized. Available tokens loaded internally.');
  }

  async start() {
    await this.init();
    this.log('Agent started.');
  }

  async stop() {
    if (this.mcpClient) {
      this.log('Closing MCP client...');
      try {
        await this.mcpClient.close();
        this.log('MCP client closed.');
      } catch (error) {
        logError('Error closing MCP client:', error);
      }
    }
  }

  // --- Helper for validation and execution, used by execute... methods
  private async validateAndExecuteAction(
    actionName: string,
    rawTransactions: unknown,
    context: HandlerContext
  ): Promise<string> {
    const validationResult = z.array(TransactionPlanSchema).safeParse(rawTransactions);
    if (!validationResult.success) {
      const errorMsg = `MCP tool '${actionName}' returned invalid transaction data.`;
      context.log('Validation Error:', errorMsg, validationResult.error);
      throw new Error(errorMsg);
    }
    if (validationResult.data.length === 0) {
      context.log(`${actionName}: No transactions returned by MCP tool.`);
      return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)} request processed. No on-chain transaction was necessary.`;
    }
    return await context.executeAction(actionName, validationResult.data);
  }

  // --- Main Processing Logic ---

  async processUserInput(userInput: string): Promise<CoreMessage> {
    if (!this.toolSet) {
      throw new Error('Agent not initialized. Call start() first.');
    }
    const userMessage: CoreUserMessage = { role: 'user', content: userInput };
    this.conversationHistory.push(userMessage);

    let assistantResponseContent = 'Sorry, an error occurred.';

    try {
      this.log('Calling generateText with Vercel AI SDK...');
      const { response, text, toolCalls, toolResults, finishReason } = await generateText({
        model: openrouter('google/gemini-2.0-flash-001'),
        messages: this.conversationHistory,
        tools: this.toolSet,
        maxSteps: 10,
        // FIX: Correctly type the callback parameter using the inferred toolset type
        onStepFinish: async (stepResult: StepResult<typeof this.toolSet>) => {
          this.log(`Step finished. Reason: ${stepResult.finishReason}`);
          // Now you can safely access stepResult properties
          // e.g., stepResult.toolCalls, stepResult.toolResults
        },
      });
      this.log(`generateText finished. Reason: ${finishReason}`);

      assistantResponseContent = text ?? 'Processing complete.';

      // FIX: Correct logging for tool calls and results
      response.messages.forEach((msg, index) => {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          msg.content.forEach(part => {
            // Check using 'tool-call' (hyphenated)
            if (part.type === 'tool-call') {
              this.log(`[LLM Request ${index}]: Tool Call - ${part.toolName}`);
            }
          });
        } else if (msg.role === 'tool') {
          // Content of a tool message is an array of ToolResultPart
          if (Array.isArray(msg.content)) {
            msg.content.forEach((toolResult: ToolResultPart) => {
              // Log the actual result content
              this.log(
                `[Tool Result ${index} for ${toolResult.toolName}]: ${JSON.stringify(toolResult.result)}`
              );
            });
          }
        }
      });

      this.conversationHistory.push(...response.messages);
    } catch (error) {
      logError('Error calling Vercel AI SDK generateText:', error);
      const errorAssistantMessage: CoreAssistantMessage = {
        role: 'assistant',
        content: assistantResponseContent,
      };
      this.conversationHistory.push(errorAssistantMessage);
    }

    // FIX: Correctly find and type the final assistant message
    const finalAssistantMessage = this.conversationHistory
      .slice()
      .reverse()
      .find(
        (
          msg
        ): msg is CoreAssistantMessage & { content: string } => // Type predicate
          msg.role === 'assistant' && typeof msg.content === 'string'
      );

    const responseMessage: CoreAssistantMessage = {
      role: 'assistant',
      // No assertion needed due to the type predicate in find()
      content: finalAssistantMessage?.content ?? assistantResponseContent,
    };

    this.log('[assistant]:', responseMessage.content);
    return responseMessage;
  }

  // --- Action Execution and Signing --- (Keep these as they are)

  async executeAction(actionName: string, transactions: TransactionPlan[]): Promise<string> {
    if (!transactions || transactions.length === 0) {
      this.log(`${actionName}: No transactions required.`);
      return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)}: No on-chain transactions required.`;
    }
    try {
      this.log(`Executing ${transactions.length} transaction(s) for ${actionName}...`);
      const txHashes: string[] = [];
      for (const transaction of transactions) {
        if (!transaction.to || !transaction.data) {
          throw new Error(`Invalid transaction object for ${actionName}: missing 'to' or 'data'.`);
        }
        const txHash = await this.signAndSendTransaction(transaction);
        this.log(`${actionName} transaction sent: ${txHash}`);
        txHashes.push(txHash);
      }
      return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)} successful! Transaction hash(es): ${txHashes.join(', ')}`;
    } catch (error: unknown) {
      const err = error as Error;
      logError(`Error executing ${actionName} action:`, err.message);
      return `Error executing ${actionName}: ${err.message}`;
    }
  }

  async signAndSendTransaction(tx: TransactionPlan): Promise<string> {
    const provider = this.signer.provider;
    if (!provider) throw new Error('Signer is not connected to a provider.');

    if (!tx.to || !tx.data) {
      logError("Transaction object missing 'to' or 'data' field:", tx);
      throw new Error("Transaction object is missing required fields ('to', 'data').");
    }

    const ethersTx: ethers.providers.TransactionRequest = {
      to: tx.to,
      value: ethers.BigNumber.from(tx.value || '0'),
      data: tx.data,
      from: this.userAddress,
    };

    try {
      const dataPrefix = tx.data ? ethers.utils.hexlify(tx.data).substring(0, 10) : '0x';
      this.log(
        `Sending transaction to ${ethersTx.to} from ${ethersTx.from} with data ${dataPrefix}...`
      );

      const txResponse = await this.signer.sendTransaction(ethersTx);
      this.log(`Transaction submitted: ${txResponse.hash}. Waiting for confirmation...`);
      const receipt = await txResponse.wait(1);
      this.log(
        `Transaction confirmed in block ${receipt.blockNumber} (Status: ${receipt.status === 1 ? 'Success' : 'Failed'}): ${txResponse.hash}`
      );
      if (receipt.status === 0) {
        throw new Error(
          `Transaction ${txResponse.hash} failed (reverted). Check blockchain explorer for details.`
        );
      }
      return txResponse.hash;
    } catch (error) {
      const errMsg = (error as any)?.reason || (error as Error).message;
      const errCode = (error as any)?.code;
      // Attempt to extract revert reason if available (ethers v5 specific)
      let revertReason = errMsg;
      if ((error as any).error?.message?.includes('reverted with reason string')) {
        try {
          const reasonHex = (error as any).error.message
            .split("reverted with reason string '")[1]
            .split("'")[0];
          if (ethers.utils.isHexString(reasonHex)) {
            revertReason = ethers.utils.toUtf8String(reasonHex);
          }
        } catch (decodeError) {
          // Ignore decode error, stick with original message
        }
      }

      logError(
        `Send transaction failed: ${errCode ? `Code: ${errCode}, ` : ''}Reason: ${revertReason}`,
        error
      );
      // Provide a clearer error message
      throw new Error(`Transaction failed: ${revertReason}`);
    }
  }

  // Add fetchAndCacheCapabilities method
  private async fetchAndCacheCapabilities(): Promise<McpGetCapabilitiesResponse> {
    this.log('Fetching swap capabilities via MCP...');
    if (!this.mcpClient) {
      throw new Error('MCP Client not initialized. Cannot fetch capabilities.');
    }

    try {
      const capabilitiesResult = await this.mcpClient.callTool({
        name: 'getCapabilities',
        arguments: { type: 'SWAP' },
      });

      // ---> Log the raw result intelligently and prepare data for validation
      this.log('Raw capabilitiesResult check:');
      let dataToValidate: any = capabilitiesResult; // Default to using the raw result
      let parsedInnerData = false;

      if (
        capabilitiesResult &&
        typeof capabilitiesResult === 'object' &&
        Array.isArray(capabilitiesResult.content) &&
        capabilitiesResult.content.length > 0 &&
        capabilitiesResult.content[0]?.type === 'text' &&
        typeof capabilitiesResult.content[0]?.text === 'string'
      ) {
        this.log('Raw result matches the { content: [{ type: "text", text: "..." }] } structure.');
        try {
          const innerData = JSON.parse(capabilitiesResult.content[0].text);
          this.log('Successfully parsed inner text content. Using this for validation.');
          dataToValidate = innerData; // Use the parsed inner data for validation
          parsedInnerData = true;

          // Log snippet of parsed inner data
          const innerDataString = JSON.stringify(innerData, null, 2);
          this.log(
            'Parsed inner text content (first 10 lines):\n',
            innerDataString.split('\n').slice(0, 10).join('\n') +
              (innerDataString.includes('\n') ? '\n... (truncated)' : '')
          );
        } catch (e) {
          logError(
            'Failed to parse inner text content from raw result. Will attempt to validate raw structure.',
            e
          );
          const rawText = capabilitiesResult.content[0].text;
          this.log(
            'Raw inner text content snippet (first 100 chars): ',
            rawText.substring(0, 100) + (rawText.length > 100 ? '...' : '')
          );
          // dataToValidate remains capabilitiesResult
        }
      } else {
        this.log('Raw result does NOT match the nested structure. Validating as is.');
        // dataToValidate remains capabilitiesResult
        // Log snippet of raw result
        const rawResultString = JSON.stringify(capabilitiesResult, null, 2);
        this.log(
          'Raw result (first 10 lines):\n',
          rawResultString.split('\n').slice(0, 10).join('\n') +
            (rawResultString.includes('\n') ? '\n... (truncated)' : '')
        );
      }

      // Validate the data (either raw or parsed inner data)
      const validationResult = McpGetCapabilitiesResponseSchema.safeParse(dataToValidate);

      // ---> Log the validation result (first 10 lines)
      this.log(
        'Validation performed on:',
        parsedInnerData ? 'Parsed Inner Data' : 'Original Raw Result'
      );
      const validationResultString = JSON.stringify(validationResult, null, 2);
      this.log(
        'Validation result (first 10 lines):\n',
        validationResultString.split('\n').slice(0, 10).join('\n') +
          (validationResultString.includes('\n') ? '\n... (truncated)' : '')
      );

      if (!validationResult.success) {
        logError('Fetched capabilities validation failed:', validationResult.error);
        // Log what failed validation for clarity
        logError('Data that failed validation:', JSON.stringify(dataToValidate));
        throw new Error(
          `Fetched capabilities failed validation: ${validationResult.error.message}`
        );
      }

      // If validation succeeded, validationResult.data holds the correctly structured capabilities
      const capabilities = validationResult.data;

      // Cache the validated data (which now MUST have the correct structure)
      try {
        await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
        // ---> Write the validated, correctly structured data (capabilities) instead of the potentially nested dataToValidate
        await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(capabilities, null, 2), 'utf-8');
        this.log('Swap capabilities cached successfully.');
      } catch (cacheError) {
        logError('Failed to cache capabilities:', cacheError);
      }

      return capabilities; // Return the validated inner data
    } catch (error) {
      logError('Error fetching or validating capabilities via MCP:', error);
      throw new Error(
        `Failed to fetch/validate capabilities from MCP server: ${(error as Error).message}`
      );
    }
  }
}

// --- TODOs / Notes ---
// - Ensure agentToolHandlers.ts is updated or its logic is fully moved here.
// - Define/Import TransactionPlanSchema and TransactionPlan type.
// - Implement robust error handling within execute...Tool methods to return meaningful errors to the LLM.
// - Verify the actual structure of your MCP server's getCapabilities response and adjust parsing.
// - Consider adding more specific error handling for transaction reverts (e.g., parsing revert reasons).
// - Make sure the path to the MCP server executable is correct.
