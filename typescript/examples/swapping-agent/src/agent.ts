import { z } from 'zod';
import {
  type WalletClient,
  type PublicClient,
  type SendTransactionParameters,
  type Address,
  type Hex,
  type TransactionReceipt,
  BaseError,
  ContractFunctionRevertedError,
  hexToString,
  isHex,
  createWalletClient,
  createPublicClient,
  http,
  type LocalAccount,
} from 'viem';
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
import { mainnet, arbitrum, optimism, polygon, base, Chain } from 'viem/chains';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '.cache', 'swap_capabilities.json');

// --- Zod Schemas for Vercel AI SDK Tools ---
const SwapTokensSchema = z.object({
  fromToken: z
    .string()
    .describe(
      'The symbol of the token to swap from (source token). It may be lowercase or uppercase.'
    ),
  toToken: z
    .string()
    .describe(
      'The symbol of the token to swap to (destination token). It may be lowercase or uppercase.'
    ),
  amount: z
    .string()
    .describe(
      'The amount of the token to swap from. It will be in a human readable format, e.g. The amount \"1.02 ETH\" will be 1.02.'
    ),
  fromChain: z.string().optional().describe('Optional chain name for the source token.'),
  toChain: z.string().optional().describe('Optional chain name for the destination token.'),
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

// --- Helper: Map chain IDs (string) to viem Chain objects AND QuickNode segments ---
interface ChainConfig {
  viemChain: Chain;
  quicknodeSegment: string;
}

// Add more chains and their corresponding QuickNode network segments
const chainIdMap: Record<string, ChainConfig> = {
  '1': { viemChain: mainnet, quicknodeSegment: '' }, // Mainnet uses base subdomain
  '42161': { viemChain: arbitrum, quicknodeSegment: 'arbitrum-mainnet' }, // Verify segment
  '10': { viemChain: optimism, quicknodeSegment: 'optimism' }, // Verify segment
  '137': { viemChain: polygon, quicknodeSegment: 'matic' }, // Verify segment
  '8453': { viemChain: base, quicknodeSegment: 'base-mainnet' }, // Verify segment
  // Add other chain IDs and their corresponding viem objects/QuickNode segments
};

// Helper function to get the viem Chain config
export function getChainConfigById(chainId: string): ChainConfig {
  const config = chainIdMap[chainId];
  if (!config) {
    throw new Error(`Unsupported chainId: ${chainId}. Please update chainIdMap.`);
  }
  return config;
}

export class Agent {
  // Store account, address, and RPC details instead of clients
  private account: LocalAccount<string>;
  private userAddress: Address;
  // Store subdomain instead of template
  private quicknodeSubdomain: string;
  private apiKey: string;
  // Remove unused client properties
  // private walletClient: WalletClient;
  // private publicClient: PublicClient;
  private tokenMap: Record<
    string,
    Array<{
      chainId: string;
      address: string;
      decimals: number;
    }>
  > = {};
  private availableTokens: string[] = [];
  public conversationHistory: CoreMessage[] = [];
  private mcpClient: Client | null = null;
  private toolSet: swappingToolSet | null = null;

  constructor(
    account: LocalAccount<string>,
    userAddress: Address,
    // Accept subdomain instead of template
    quicknodeSubdomain: string,
    apiKey: string
  ) {
    if (!account) {
      throw new Error('Viem Account is required for Agent initialization.');
    }
    if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      throw new Error('Valid userAddress (0x...) is required.');
    }
    // Check for subdomain and API key
    if (!quicknodeSubdomain || !apiKey) {
      throw new Error('QuickNode Subdomain and API Key are required.');
    }

    this.account = account;
    this.userAddress = userAddress;
    // Store subdomain
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.apiKey = apiKey;

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set!');
    }
  }

  async log(...args: unknown[]) {
    console.error(...args);
  }

  private getHandlerContext(): HandlerContext {
    if (!this.mcpClient) {
      throw new Error('MCP Client not initialized!');
    }
    if (!this.quicknodeSubdomain || !this.apiKey) {
      throw new Error('QuickNode details missing in agent context!');
    }
    const context: HandlerContext = {
      mcpClient: this.mcpClient,
      tokenMap: this.tokenMap,
      userAddress: this.userAddress,
      executeAction: this.executeAction.bind(this),
      log: this.log.bind(this),
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.apiKey,
    };
    return context;
  }

  async init() {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an assistant that provides access to blockchain swapping functionalities via EmberAI Onchain Actions.

<examples>
<example>
<user>swap 1 ETH to USDC on Ethereum</user>
<parameters>
<amount>1</amount>
<fromToken>ETH</fromToken>
<toToken>USDC</toToken>
<toChain>Ethereum</toChain>
</parameters>
</example>

<example>
<user>sell 89 fartcoin</user>
<parameters>
<amount>89</amount>
<fromToken>fartcoin</fromToken>
</parameters>
</example>

<example>
<user>Convert 10.5 USDC to ETH</user>
<parameters>
<amount>10.5</amount>
<fromToken>USDC</fromToken>
<toToken>ETH</toToken>
</parameters>
</example>

<example>
<user>Swap 100.076 arb on arbitrum for dog on base</user>
<parameters>
<amount>100.076</amount>
<fromToken>arb</fromToken>
<toToken>dog</toToken>
<fromChain>arbitrum</fromChain>
<toChain>base</toChain>
</parameters>
</example>
</examples>

Present the user with a list of tokens and chains they can swap from and to if provided by the tool response. Never respond in markdown, always use plain text. Never add links to your response. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason.`,
      },
    ];

    let swapCapabilities: McpGetCapabilitiesResponse | undefined;
    const useCache = process.env.AGENT_DEBUG === 'true';

    this.log('Initializing MCP client via stdio...');
    try {
      this.mcpClient = new Client(
        { name: 'SwappingAgent', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      const transport = new StdioClientTransport({
        command: 'node',
        args: ['../../../typescript/mcp-tools/emberai-mcp/dist/index.js'],
      });

      await this.mcpClient.connect(transport);
      this.log('MCP client initialized successfully.');

      if (useCache) {
        try {
          await fs.access(CACHE_FILE_PATH);
          this.log('Loading swap capabilities from cache...');
          const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
          const parsedJson = JSON.parse(cachedData);
          const validationResult = McpGetCapabilitiesResponseSchema.safeParse(parsedJson);
          if (validationResult.success) {
            swapCapabilities = validationResult.data;
            this.log('Cached capabilities loaded and validated successfully.');
          } else {
            logError('Cached capabilities validation failed:', validationResult.error);
            logError('Data that failed validation:', JSON.stringify(parsedJson));
            this.log('Proceeding to fetch fresh capabilities...');
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('invalid JSON')) {
            logError('Error reading or parsing cache file:', error);
          } else {
            this.log('Cache not found or invalid, fetching capabilities via MCP...');
          }
        }
      }

      if (!swapCapabilities) {
        this.log('Fetching swap capabilities via MCP...');
        swapCapabilities = await this.fetchAndCacheCapabilities();
      }

      this.log(
        'swapCapabilities before processing (first 10 lines):',
        swapCapabilities
          ? JSON.stringify(swapCapabilities, null, 2).split('\n').slice(0, 10).join('\n')
          : 'undefined'
      );
      if (swapCapabilities?.capabilities) {
        this.tokenMap = {};
        this.availableTokens = [];
        swapCapabilities.capabilities.forEach(capabilityEntry => {
          if (capabilityEntry.swapCapability) {
            const swapCap = capabilityEntry.swapCapability;
            swapCap.supportedTokens?.forEach(token => {
              if (token.symbol && token.tokenUid?.chainId && token.tokenUid?.address) {
                if (!this.tokenMap[token.symbol]) {
                  this.tokenMap[token.symbol] = [];
                  this.availableTokens.push(token.symbol);
                }
                this.tokenMap[token.symbol].push({
                  chainId: token.tokenUid.chainId,
                  address: token.tokenUid.address,
                  decimals: token.decimals ?? 18,
                });
              }
            });
          }
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
        onStepFinish: async (stepResult: StepResult<typeof this.toolSet>) => {
          this.log(`Step finished. Reason: ${stepResult.finishReason}`);
        },
      });
      this.log(`generateText finished. Reason: ${finishReason}`);

      assistantResponseContent = text ?? 'Processing complete.';

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

    const finalAssistantMessage = this.conversationHistory
      .slice()
      .reverse()
      .find(
        (msg): msg is CoreAssistantMessage & { content: string } =>
          msg.role === 'assistant' && typeof msg.content === 'string'
      );

    const responseMessage: CoreAssistantMessage = {
      role: 'assistant',
      content: finalAssistantMessage?.content ?? assistantResponseContent,
    };

    this.log('[assistant]:', responseMessage.content);
    return responseMessage;
  }

  async executeAction(actionName: string, transactions: TransactionPlan[]): Promise<string> {
    if (!transactions || transactions.length === 0) {
      this.log(`${actionName}: No transactions required.`);
      return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)}: No on-chain transactions required.`;
    }
    try {
      this.log(`Executing ${transactions.length} transaction(s) for ${actionName}...`);
      const txHashes: string[] = [];
      for (const transaction of transactions) {
        const txHash = await this.signAndSendTransaction(transaction);
        this.log(`${actionName} transaction sent: ${txHash}`);
        txHashes.push(txHash);
      }
      return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)} successful! Transaction hash(es): ${txHashes.join(', ')}`;
    } catch (error: unknown) {
      const err = error as Error;
      logError(`Error executing ${actionName} action:`, err.message);
      throw new Error(`Error executing ${actionName}: ${err.message}`);
    }
  }

  async signAndSendTransaction(tx: TransactionPlan): Promise<string> {
    // Validate tx.chainId
    if (!tx.chainId) {
      const errorMsg = `Transaction object missing required 'chainId' field`;
      logError(errorMsg, tx);
      throw new Error(errorMsg);
    }

    // Get the viem Chain config for this transaction
    let chainConfig: ChainConfig;
    try {
      chainConfig = getChainConfigById(tx.chainId);
    } catch (chainError) {
      logError((chainError as Error).message, tx);
      throw chainError; // Re-throw the specific chain error
    }
    const targetChain = chainConfig.viemChain;
    const networkSegment = chainConfig.quicknodeSegment;

    // --- Dynamic Client Creation ---
    // Construct the specific RPC URL for this chain based on segment
    let dynamicRpcUrl: string;
    if (networkSegment === '') {
      // Mainnet case: subdomain.quiknode.pro/api_key
      // Use this.quicknodeSubdomain
      dynamicRpcUrl = `https://${this.quicknodeSubdomain}.quiknode.pro/${this.apiKey}`;
    } else {
      // Other networks: subdomain.network_segment.quiknode.pro/api_key
      // Use this.quicknodeSubdomain
      dynamicRpcUrl = `https://${this.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${this.apiKey}`;
    }

    // Create temporary clients for this transaction
    const tempPublicClient = createPublicClient({
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });
    // Create a temporary wallet client to use sendTransaction
    const tempWalletClient = createWalletClient({
      account: this.account,
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });
    // --- End Dynamic Client Creation ---

    // Validate tx.to and tx.data format
    if (!tx.to || !/^0x[a-fA-F0-9]{40}$/.test(tx.to)) {
      const errorMsg = `Transaction object invalid 'to' field: ${tx.to}`;
      logError(errorMsg, tx);
      throw new Error(errorMsg);
    }
    if (!tx.data || !isHex(tx.data)) {
      const errorMsg = `Transaction object invalid 'data' field (not hex): ${tx.data}`;
      logError(errorMsg, tx);
      throw new Error(errorMsg);
    }

    const toAddress = tx.to as Address;
    const txData = tx.data as Hex;
    const txValue = tx.value ? BigInt(tx.value) : 0n;

    // Construct viem transaction parameters using the target chain
    // Prepare transaction for signing (matching parameters needed for estimateGas/sign)
    const baseTx = {
      account: this.userAddress, // Explicitly set account for Wallet Client
      to: toAddress,
      value: txValue,
      data: txData,
      chain: targetChain, // Pass the specific chain object
      // Gas price related fields might be needed depending on chain & viem version
      // Add nonce if needed, though estimateGas often handles it
    };

    try {
      const dataPrefix = txData.substring(0, 10);
      this.log(
        `Preparing transaction to ${baseTx.to} on chain ${targetChain.id} (${networkSegment}) via ${dynamicRpcUrl.split('/')[2]} from ${this.userAddress} with data ${dataPrefix}...`
      );

      // Send transaction directly without manual gas estimation
      this.log(`Sending transaction...`);
      const txHash = await tempWalletClient.sendTransaction({
        to: toAddress,
        value: txValue,
        data: txData,
        // Let the wallet client handle gas estimation automatically
      });

      this.log(
        `Transaction submitted to chain ${targetChain.id}: ${txHash}. Waiting for confirmation...`
      );

      // Wait for confirmation using the TEMPORARY PublicClient
      const receipt: TransactionReceipt = await tempPublicClient.waitForTransactionReceipt({
        hash: txHash,
        // confirmations: 1, // Optional: specify confirmations
      });

      this.log(
        `Transaction confirmed on chain ${targetChain.id} in block ${receipt.blockNumber} (Status: ${receipt.status}): ${txHash}`
      );

      if (receipt.status === 'reverted') {
        throw new Error(
          `Transaction ${txHash} failed (reverted). Check blockchain explorer for details.`
        );
      }
      return txHash;
    } catch (error: unknown) {
      let revertReason =
        error instanceof Error
          ? `Transaction failed: ${error.message}`
          : 'Transaction failed: Unknown error';

      // Handle viem specific errors
      if (error instanceof BaseError) {
        // Change callback parameter type from Error to unknown
        const cause = error.walk((e: unknown) => e instanceof ContractFunctionRevertedError);
        if (cause instanceof ContractFunctionRevertedError) {
          const errorName = cause.reason ?? cause.shortMessage;
          revertReason = `Transaction reverted: ${errorName}`;
          // Attempt to decode revert data if it exists
          if (cause.data?.errorName === '_decodeRevertReason') {
            const hexReason = cause.data.args?.[0];
            if (hexReason && typeof hexReason === 'string' && isHex(hexReason as Hex)) {
              try {
                revertReason = `Transaction reverted: ${hexToString(hexReason as Hex)}`;
              } catch (decodeError) {
                logError('Failed to decode revert reason hex:', hexReason, decodeError);
                // Stick with the error name or short message if decoding fails
              }
            }
          }
        } else {
          // Use the short message from the original BaseError
          revertReason = `Transaction failed: ${error.shortMessage}`;
        }
        logError(
          `Send transaction failed: ${revertReason}`,
          error.details // Log detailed error info from BaseError
        );
      } else if (error instanceof Error) {
        // Handle standard JS Errors
        logError(`Send transaction failed: ${revertReason}`, error); // Pass the Error object
      } else {
        // Handle non-Error types (log the raw value)
        logError(`Send transaction failed with unknown error type: ${revertReason}`, error);
      }

      throw new Error(revertReason);
    }
  }

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

      this.log('Raw capabilitiesResult check:');
      let dataToValidate: any = capabilitiesResult;
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
          dataToValidate = innerData;
          parsedInnerData = true;

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
        }
      } else {
        this.log('Raw result does NOT match the nested structure. Validating as is.');
      }

      const validationResult = McpGetCapabilitiesResponseSchema.safeParse(dataToValidate);

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
        logError('Data that failed validation:', JSON.stringify(dataToValidate));
        throw new Error(
          `Fetched capabilities failed validation: ${validationResult.error.message}`
        );
      }

      const capabilities = validationResult.data;

      try {
        await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
        await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(capabilities, null, 2), 'utf-8');
        this.log('Swap capabilities cached successfully.');
      } catch (cacheError) {
        logError('Failed to cache capabilities:', cacheError);
      }

      return capabilities;
    } catch (error) {
      logError('Error fetching or validating capabilities via MCP:', error);
      throw new Error(
        `Failed to fetch/validate capabilities from MCP server: ${(error as Error).message}`
      );
    }
  }
}
