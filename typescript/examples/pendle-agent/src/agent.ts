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
import { logError, getChainConfigById, type ChainConfig } from './utils.js';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

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
  tokenUid: TokenIdentifierSchema.describe(
    'For native tokens, this may be empty.'
  ).optional(),
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

export const GetPendleMarketsRequestSchema = z.object({})
export type GetPendleMarketsRequestArgs = z.infer<
  typeof GetPendleMarketsRequestSchema
>

export const YieldMarketSchema = z.object({
  name: z
    .string()
    .describe('The name of the yield market.'),
  address: z
    .string()
    .describe('The address of the yield market.'),
  expiry: z
    .string()
    .describe('The expiry identifier of the yield market.'),
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
    .describe('The chain ID on which this yield market exists.'),
})
export type YieldMarket = z.infer<typeof YieldMarketSchema>

export const GetYieldMarketsResponseSchema = z.object({
  markets: z
    .array(YieldMarketSchema)
    .describe('List of yield markets matching the request criteria.'),
})
export type GetYieldMarketsResponse = z.infer<
  typeof GetYieldMarketsResponseSchema
>

export const SwapTokensSchema = z.object({
  fromTokenName: z
    .string()
    .describe('The token to swap from.'),
  toTokenName: z
    .string()
    .describe('The token to swap to.'),
  humanReadableAmount: z
    .string()
    .describe(
      'The amount of the token to swap from. It will be in a human readable format, e.g. The amount "1.02 ETH" will be 1.02.'
    ),
  chainName: z.string().optional().describe('Optional chain name for the swap. Both tokens must be on the same chain.'),
});
export type SwapTokensArgs = z.infer<typeof SwapTokensSchema>;

type YieldToolSet = {
  listMarkets: Tool<z.ZodObject<{}>, Awaited<string>>;
  swapTokens: Tool<typeof SwapTokensSchema, Awaited<string>>;
};

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
    }>
  > = {};
  private availableTokens: string[] = [];
  public conversationHistory: CoreMessage[] = [];
  private mcpClient: Client;
  private toolSet: YieldToolSet | null = null;
  private yieldMarkets: YieldMarket[] = [];

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
    this.mcpClient = new Client(
      { name: 'PendleAgent', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set!');
    }
  }

  async log(...args: unknown[]) {
    console.error(...args);
  }

  private getHandlerContext(): HandlerContext {
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

  private populatePendleTokens(markets: YieldMarket[]) {
    if (!markets || markets.length === 0) {
      this.log('No yield markets to process for token population');
      return;
    }

    this.log(`Processing ${markets.length} yield markets to extract PT and YT tokens...`);
    let ptTokensAdded = 0;
    let ytTokensAdded = 0;

    markets.forEach(market => {
      const chainId = market.chainId;
      const baseSymbol = market.underlyingAsset?.symbol || market.name;
      const baseName = market.underlyingAsset?.name || market.name;

      // Add PT token
      const ptSymbol = `${baseSymbol}_PT`;

      if (!this.tokenMap[ptSymbol]) {
        this.tokenMap[ptSymbol] = [];
        this.availableTokens.push(ptSymbol);
      }

      // Check if this PT token for this chain is already added
      const existingPtForChain = this.tokenMap[ptSymbol].find(token => token.chainId === chainId);
      if (!existingPtForChain) {
        this.tokenMap[ptSymbol].push({
          chainId,
          address: market.pt,
        });
        ptTokensAdded++;
      }

      // Add YT token
      const ytSymbol = `${baseSymbol}_YT`;

      if (!this.tokenMap[ytSymbol]) {
        this.tokenMap[ytSymbol] = [];
        this.availableTokens.push(ytSymbol);
      }

      // Check if this YT token for this chain is already added
      const existingYtForChain = this.tokenMap[ytSymbol].find(token => token.chainId === chainId);
      if (!existingYtForChain) {
        this.tokenMap[ytSymbol].push({
          chainId,
          address: market.yt,
        });
        ytTokensAdded++;
      }
    });

    this.log(`Added ${ptTokensAdded} PT tokens and ${ytTokensAdded} YT tokens to the token map. Total tokens: ${this.availableTokens.length}`);
  }

  async init() {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an assistant that provides access to Pendle Protocol functionality via Ember AI On-chain Actions.

You can help users interact with Pendle yield markets, which separate yield-bearing tokens into Principal Tokens (PT) and Yield Tokens (YT).

About Pendle Protocol:
- Pendle is a yield trading protocol that tokenizes future yield
- Principal Tokens (PT) represent the principal portion of a yield-bearing asset
- Yield Tokens (YT) represent the yield/interest portion of a yield-bearing asset
- Users can buy/sell/trade these tokens separately to express different yield strategies
- Both tokens in a swap must be on the same blockchain network/chain

You can:
- List available Pendle markets using the listMarkets tool
- Swap tokens to acquire PT or YT tokens using the swapTokens tool

PT/YT Token Naming Convention:
- PT tokens have a symbol suffix of _PT (e.g., wstETH_PT, USDC_PT)
- YT tokens have a symbol suffix of _YT (e.g., wstETH_YT, USDC_YT)
- These tokens are derived from their underlying tokens (e.g., wstETH, USDC)

Note that PT (Principal Tokens) are suffixed with _PT in their symbol and YT (Yield Tokens) are suffixed with _YT.
For example, wstETH_PT is the Principal Token for wstETH, and USDC_YT is the Yield Token for USDC.

Never respond in markdown, always use plain text. Never add links to your response. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason.`,
      },
    ];

    const mcpToolPath = '../../lib/mcp-tools/emberai-mcp/dist/index.js';
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

    // Initialize available tokens from MCP capabilities
    try {
      this.log('Fetching available tokens...');
      const result = await this.mcpClient.callTool({
        name: 'getTokens',
        arguments: {
          chainId: '',
          filter: '',
        },
      });

      const parsedResult = parseMcpToolResponse(result, this.getHandlerContext(), 'getTokens');

      if (parsedResult && typeof parsedResult === 'object' && 'tokens' in parsedResult) {
        const tokens = (parsedResult as any).tokens;
        if (Array.isArray(tokens)) {
          this.tokenMap = {};
          this.availableTokens = [];

          tokens.forEach(token => {
            if (token.symbol && token.tokenUid?.chainId && token.tokenUid?.address) {
              if (!this.tokenMap[token.symbol]) {
                this.tokenMap[token.symbol] = [];
                this.availableTokens.push(token.symbol);
              }
              this.tokenMap[token.symbol].push({
                chainId: token.tokenUid.chainId,
                address: token.tokenUid.address,
              });
            }
          });

          this.log(`Loaded ${this.availableTokens.length} available tokens`);
        }
      } else {
        this.log('Failed to parse tokens data from MCP');
      }
    } catch (error) {
      this.log('Error fetching tokens:', error);
    }

    // Fetch yield markets during initialization
    try {
      this.log('Fetching yield markets during initialization...');
      const marketsResponse = await this.fetchMarkets();
      this.yieldMarkets = marketsResponse.markets;
      this.log(`Successfully loaded ${this.yieldMarkets.length} Pendle markets`);

      // Populate PT and YT tokens in the token map
      this.populatePendleTokens(this.yieldMarkets);
    } catch (error) {
      this.log('Error fetching Pendle markets during initialization:', error);
    }

    this.toolSet = {
      listMarkets: tool({
        description: 'List all available Pendle markets with their details.',
        parameters: z.object({}),
        execute: async () => {
          try {
            let marketInfo = '';
            if (this.yieldMarkets.length > 0) {
              // Group markets by chain
              const marketsByChain: Record<string, YieldMarket[]> = {};

              this.yieldMarkets.forEach(market => {
                if (!marketsByChain[market.chainId]) {
                  marketsByChain[market.chainId] = [];
                }
                marketsByChain[market.chainId].push(market);
              });

              // Format the market information in a readable text format
              marketInfo = 'Available Pendle markets:\n\n';

              for (const [chainId, markets] of Object.entries(marketsByChain)) {
                marketInfo += `Chain ID ${chainId} (${markets.length} markets):\n`;

                markets.forEach((market, i) => {
                  const baseSymbol = market.underlyingAsset?.symbol || market.name;
                  const ptSymbol = `${baseSymbol}_PT`;
                  const ytSymbol = `${baseSymbol}_YT`;

                  marketInfo += `${i+1}. ${market.name}\n`;
                  marketInfo += `   Expiry: ${market.expiry}\n`;
                  marketInfo += `   Underlying Asset: ${market.underlyingAsset?.symbol || 'Unknown'} (${market.underlyingAsset?.name || 'Unknown'})\n`;
                  marketInfo += `   Market Address: ${market.address}\n`;
                  marketInfo += `   PT Symbol: ${ptSymbol} - Address: ${market.pt}\n`;
                  marketInfo += `   YT Symbol: ${ytSymbol} - Address: ${market.yt}\n`;
                  marketInfo += `   SY Address: ${market.sy}\n\n`;
                });
              }

              marketInfo += `Total markets: ${this.yieldMarkets.length}`;
            } else {
              try {
                // If we don't have markets cached, fetch them now
                const response = await this.fetchMarkets();
                this.yieldMarkets = response.markets;

                if (this.yieldMarkets.length > 0) {
                  // Create a new formatted market list instead of recursively calling
                  // Return to the start of this function's logic with the updated markets
                  const marketsByChain: Record<string, YieldMarket[]> = {};
                  this.yieldMarkets.forEach(market => {
                    if (!marketsByChain[market.chainId]) {
                      marketsByChain[market.chainId] = [];
                    }
                    marketsByChain[market.chainId].push(market);
                  });

                  marketInfo = 'Available Pendle markets:\n\n';

                  for (const [chainId, markets] of Object.entries(marketsByChain)) {
                    marketInfo += `Chain ID ${chainId} (${markets.length} markets):\n`;

                    markets.forEach((market, i) => {
                      const baseSymbol = market.underlyingAsset?.symbol || market.name;
                      const ptSymbol = `${baseSymbol}_PT`;
                      const ytSymbol = `${baseSymbol}_YT`;

                      marketInfo += `${i+1}. ${market.name}\n`;
                      marketInfo += `   Expiry: ${market.expiry}\n`;
                      marketInfo += `   Underlying Asset: ${market.underlyingAsset?.symbol || 'Unknown'} (${market.underlyingAsset?.name || 'Unknown'})\n`;
                      marketInfo += `   Market Address: ${market.address}\n`;
                      marketInfo += `   PT Symbol: ${ptSymbol} - Address: ${market.pt}\n`;
                      marketInfo += `   YT Symbol: ${ytSymbol} - Address: ${market.yt}\n`;
                      marketInfo += `   SY Address: ${market.sy}\n\n`;
                    });
                  }

                  marketInfo += `Total markets: ${this.yieldMarkets.length}`;
                } else {
                  marketInfo = 'No Pendle markets available.';
                }
              } catch (error: any) {
                logError(`Error fetching Pendle markets: ${error.message}`);
                return `Error fetching Pendle markets: ${error.message}`;
              }
            }

            return marketInfo;
          } catch (error: any) {
            logError(`Error listing Pendle markets: ${error.message}`);
            return `Error fetching Pendle markets: ${error.message}`;
          }
        },
      }),
      swapTokens: tool({
        description: 'Swap tokens or acquire Pendle PT/YT tokens. Requires fromToken, toToken, and amount.',
        parameters: SwapTokensSchema,
        execute: async args => {
          this.log('Executing swap tokens tool with args:', args);
          try {
            const result = await handleSwapTokens(args, this.getHandlerContext());
            return result;
          } catch (error: any) {
            logError(`Error during swapTokens: ${error.message}`);
            return `Error swapping tokens: ${error.message}`;
          }
        },
      }),
    };

    this.log('Agent initialized. Available tokens and Pendle markets loaded internally.');
  }

  async start() {
    await this.init();
    this.log('Agent started.');
  }

  async stop() {
    this.log('Closing MCP client...');
    try {
      await this.mcpClient.close();
      this.log('MCP client closed.');
    } catch (error) {
      logError('Error closing MCP client:', error);
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

  public async fetchMarkets(): Promise<GetYieldMarketsResponse> {
    this.log('Fetching pendle markets via MCP...');

    const result = await this.mcpClient.callTool({
      name: 'getYieldMarkets',
      arguments: {}
    });

    // Check if the response has the expected structure
    if (!result.content || !Array.isArray(result.content) || result.content.length === 0) {
      throw new Error('Invalid response format from getYieldMarkets tool');
    }

    const contentItem = result.content[0];
    if (contentItem.type !== 'text' || typeof contentItem.text !== 'string') {
      throw new Error('Invalid content format from getYieldMarkets tool');
    }

    // Parse the JSON string from the text field
    const parsedData = JSON.parse(contentItem.text);

    // Validate the parsed data with our schema
    const validationResult = GetYieldMarketsResponseSchema.safeParse(parsedData);

    if (!validationResult.success) {
      throw new Error('Failed to validate Pendle markets data structure');
    }

    return validationResult.data;
  }
}
