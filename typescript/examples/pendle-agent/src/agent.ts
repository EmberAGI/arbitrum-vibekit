import { z } from 'zod';
import {
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
  handleSwapTokens,
  parseMcpToolResponse,
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


export const TokenIdentifierSchema = z.object({
  chainId: z
    .string()
    .describe('The chain ID of the token identifier.'),
  address: z
    .string()
    .describe('The address of the token identifier.'),
})
export type TokenIdentifier = z.infer<typeof TokenIdentifierSchema>

export const TokenSchema = z.object({
  token_uid: TokenIdentifierSchema.describe(
    'For native tokens, this may be empty.'
  ),
  name: z
    .string()
    .describe('The human-readable name of the token.'),
  symbol: z
    .string()
    .describe('The ticker symbol of the token.'),
  isNative: z
    .boolean()
    .describe('Whether this token is native to its chain.'),
  decimals: z
    .number()
    .int()
    .describe('The number of decimal places the token uses.'),
  iconUri: z
    .string()
    .optional()
    .describe('Optional URI for the token icon.'),
  usdPrice: z
    .string()
    .optional()
    .describe(
      'Optional USD price as a string to avoid floating-point precision issues, e.g., "123.456789".'
    ),
  isVetted: z
    .boolean()
    .describe('Whether the token has been vetted.'),
})
export type Token = z.infer<typeof TokenSchema>

export const GetPendleMarketsRequestSchema = z.object({
  chainIds: z
    .array(z.string())
    .describe(
      'List of chain IDs to filter markets by. If empty, returns markets from all supported chains.'
    ),
})
export type GetPendleMarketsRequestArgs = z.infer<
  typeof GetPendleMarketsRequestSchema
>

export const PendleMarketSchema = z.object({
  name: z
    .string()
    .describe('The name of the Pendle market.'),
  address: z
    .string()
    .describe('The address of the Pendle market.'),
  expiry: z
    .string()
    .describe('The expiry identifier of the Pendle market.'),
  pt: z
    .string()
    .describe('The address of the PT (principal token).'),
  yt: z
    .string()
    .describe('The address of the YT (yield token).'),
  sy: z
    .string()
    .describe('The address of the SY (standardized yield token).'),
  underlyingAsset: TokenSchema.describe(
    'The underlying asset of the Pendle market.'
  ),
  chainId: z
    .string()
    .describe('The chain ID on which this Pendle market exists.'),
})
export type PendleMarket = z.infer<typeof PendleMarketSchema>

export const GetPendleMarketsResponseSchema = z.object({
  markets: z
    .array(PendleMarketSchema)
    .describe('List of Pendle markets matching the request criteria.'),
})
export type GetPendleMarketsResponse = z.infer<
  typeof GetPendleMarketsResponseSchema
>

function logError(...args: unknown[]) {
  console.error(...args);
}

type PendleToolSet = {
  getPendleMarkets: Tool<typeof GetPendleMarketsRequestSchema, Awaited<string>>;
};

interface ChainConfig {
  viemChain: Chain;
  quicknodeSegment: string;
}

const chainIdMap: Record<string, ChainConfig> = {
  '1': { viemChain: mainnet, quicknodeSegment: '' },
  '42161': { viemChain: arbitrum, quicknodeSegment: 'arbitrum-mainnet' },
  '10': { viemChain: optimism, quicknodeSegment: 'optimism' },
  '137': { viemChain: polygon, quicknodeSegment: 'matic' },
  '8453': { viemChain: base, quicknodeSegment: 'base-mainnet' },
};

export function getChainConfigById(chainId: string): ChainConfig {
  const config = chainIdMap[chainId];
  if (!config) {
    throw new Error(`Unsupported chainId: ${chainId}. Please update chainIdMap.`);
  }
  return config;
}

export class Agent {
  private account: LocalAccount<string>;
  private userAddress: Address;
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;
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
  private toolSet: PendleToolSet | null = null;

  constructor(
    account: LocalAccount<string>,
    userAddress: Address,
    quicknodeSubdomain: string,
    quicknodeApiKey: string
  ) {
    this.account = account;
    this.userAddress = userAddress;
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;

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

    const context: HandlerContext = {
      mcpClient: this.mcpClient,
      tokenMap: this.tokenMap,
      userAddress: this.userAddress,
      executeAction: this.executeAction.bind(this),
      log: this.log.bind(this),
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
    };
    return context;
  }

  async init() {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an assistant that provides access to Pendle Protocol functionality via Ember AI On-chain Actions.

Never respond in markdown, always use plain text. Never add links to your response. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason.`,
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
        args: ['/app/mcp-tools/emberai-mcp/dist/index.js'],
        env: {
          ...process.env, // Inherit existing environment variables
          EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? 'grpc.api.emberai.xyz:50051',
        },
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
    if (!tx.chainId) {
      const errorMsg = `Transaction object missing required 'chainId' field`;
      logError(errorMsg, tx);
      throw new Error(errorMsg);
    }

    let chainConfig: ChainConfig;
    try {
      chainConfig = getChainConfigById(tx.chainId);
    } catch (chainError) {
      logError((chainError as Error).message, tx);
      throw chainError;
    }
    const targetChain = chainConfig.viemChain;
    const networkSegment = chainConfig.quicknodeSegment;

    let dynamicRpcUrl: string;
    if (networkSegment === '') {
      dynamicRpcUrl = `https://${this.quicknodeSubdomain}.quiknode.pro/${this.quicknodeApiKey}`;
    } else {
      dynamicRpcUrl = `https://${this.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${this.quicknodeApiKey}`;
    }

    const tempPublicClient = createPublicClient({
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });
    const tempWalletClient = createWalletClient({
      account: this.account,
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });

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

    const baseTx = {
      account: this.userAddress,
      to: toAddress,
      value: txValue,
      data: txData,
      chain: targetChain,
    };

    try {
      const dataPrefix = txData.substring(0, 10);
      this.log(
        `Preparing transaction to ${baseTx.to} on chain ${targetChain.id} (${networkSegment}) via ${dynamicRpcUrl.split('/')[2]} from ${this.userAddress} with data ${dataPrefix}...`
      );

      this.log(`Sending transaction...`);
      const txHash = await tempWalletClient.sendTransaction({
        to: toAddress,
        value: txValue,
        data: txData,
      });

      this.log(
        `Transaction submitted to chain ${targetChain.id}: ${txHash}. Waiting for confirmation...`
      );

      const receipt: TransactionReceipt = await tempPublicClient.waitForTransactionReceipt({
        hash: txHash,
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

      if (error instanceof BaseError) {
        const cause = error.walk((e: unknown) => e instanceof ContractFunctionRevertedError);
        if (cause instanceof ContractFunctionRevertedError) {
          const errorName = cause.reason ?? cause.shortMessage;
          revertReason = `Transaction reverted: ${errorName}`;
          if (cause.data?.errorName === '_decodeRevertReason') {
            const hexReason = cause.data.args?.[0];
            if (hexReason && typeof hexReason === 'string' && isHex(hexReason as Hex)) {
              try {
                revertReason = `Transaction reverted: ${hexToString(hexReason as Hex)}`;
              } catch (decodeError) {
                logError('Failed to decode revert reason hex:', hexReason, decodeError);
              }
            }
          }
        } else {
          revertReason = `Transaction failed: ${error.shortMessage}`;
        }
        logError(`Send transaction failed: ${revertReason}`, error.details);
      } else if (error instanceof Error) {
        logError(`Send transaction failed: ${revertReason}`, error);
      } else {
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
      // Read timeout from env var, default to 90 seconds
      const mcpTimeoutMs = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || '30000', 10);
      this.log(`Using MCP tool timeout: ${mcpTimeoutMs}ms`);

      const capabilitiesResult = await this.mcpClient.callTool(
        {
          name: 'getCapabilities',
          arguments: { type: 'SWAP' },
        },
        undefined,
        { timeout: mcpTimeoutMs } // Use configured timeout
      );

      this.log('Raw capabilitiesResult received from MCP.');

      const dataToValidate = parseMcpToolResponse(
        capabilitiesResult,
        this.getHandlerContext(),
        'getCapabilities'
      );

      const validationResult = McpGetCapabilitiesResponseSchema.safeParse(dataToValidate);

      this.log('Validation performed on potentially parsed data.');
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
