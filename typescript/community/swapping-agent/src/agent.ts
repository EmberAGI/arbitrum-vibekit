import { promises as fs } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
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
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
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
import { z } from 'zod';
import { handleSwapTokens } from './agentToolHandlers.js';

import type { HandlerContext } from './agentToolHandlers.js';

import {
  SwapTokensSchema,
  McpGetCapabilitiesResponseSchema,
  type TransactionPlan,
  type McpGetCapabilitiesResponse,
} from '@emberai/arbitrum-vibekit-core/ember-schemas';

import { mainnet, arbitrum, optimism, polygon, base } from 'viem/chains';
import type { Chain } from 'viem/chains';

const providerSelector = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

const availableProviders = getAvailableProviders(providerSelector);

if (availableProviders.length === 0) {
  throw new Error(
    'No AI providers configured. Please set at least one of: OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or HYPERBOLIC_API_KEY.'
  );
}

const preferredProvider = process.env.AI_PROVIDER || availableProviders[0]!;

const selectedProvider = providerSelector[preferredProvider as keyof typeof providerSelector];

if (!selectedProvider) {
  throw new Error(
    `Preferred provider '${preferredProvider}' is not available. Available providers: ${availableProviders.join(', ')}`
  );
}

const modelOverride = process.env.AI_MODEL;

console.log(
  `Using AI provider: ${preferredProvider} (available: ${availableProviders.join(', ')})` +
    (modelOverride ? ` with model: ${modelOverride}` : '')
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '.cache', 'swap_capabilities.json');

function logError(...args: unknown[]) {
  console.error(...args);
}

type swappingToolSet = {
  swapTokens: Tool<typeof SwapTokensSchema, Awaited<ReturnType<typeof handleSwapTokens>>>;
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
  private toolSet: swappingToolSet | null = null;

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
        content: `You are an assistant that provides access to blockchain swapping functionalities via Ember AI On-chain Actions.

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

      const require = createRequire(import.meta.url);
      const mcpToolPath = require.resolve('ember-mcp-tool-server');

      const transport = new StdioClientTransport({
        command: 'node',
        args: [mcpToolPath],
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
                this.tokenMap[token.symbol]!.push({
                  chainId: token.tokenUid!.chainId,
                  address: token.tokenUid!.address,
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
          description: 'Swap or convert tokens.',
          parameters: SwapTokensSchema,
          execute: async args => {
            try {
              return await handleSwapTokens(args, this.getHandlerContext());
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logError(`Error during swapTokens tool execution: ${errorMessage}`);
              throw error;
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
      const { response, text, finishReason } = await generateText({
        model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(),
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

      const dataToValidate = parseMcpToolResponsePayload(capabilitiesResult, z.any());

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
