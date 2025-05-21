import { type Address } from 'viem';
import { type HandlerContext, handleSwapTokens } from './agentToolHandlers.js';
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit';
import {
  generateText,
  tool,
  type Tool,
  type CoreMessage,
  type ToolResultPart,
  type StepResult,
} from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { logError, getChainConfigById, type ChainConfig } from './utils.js';
import { createRequire } from 'module';
import type { Task } from 'a2a-samples-js/schema';
import {
  GetPendleMarketsRequestSchema,
  GetYieldMarketsResponseSchema,
  SwapTokensSchema,
  type PendleAgentToken,
  type YieldMarket,
  type GetYieldMarketsResponse,
} from 'ember-schemas';
import { z } from 'zod';
import { type TransactionPlan } from 'ember-schemas';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

type YieldToolSet = {
  listMarkets: Tool<z.ZodObject<{}>, Awaited<Task>>;
  swapTokens: Tool<typeof SwapTokensSchema, Awaited<ReturnType<typeof handleSwapTokens>>>;
};

export class Agent {
  private userAddress: Address | undefined;
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

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.userAddress = undefined;
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
      userAddress: this.userAddress!,
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

    this.log(
      `Added ${ptTokensAdded} PT tokens and ${ytTokensAdded} YT tokens to the token map. Total tokens: ${this.availableTokens.length}`
    );
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

      // Define a schema for token response validation that matches GetTokensResponse structure
      const GetTokensResponseSchema = z.object({
        tokens: z.array(
          z.object({
            symbol: z.string().optional(),
            tokenUid: z
              .object({
                chainId: z.string(),
                address: z.string(),
              })
              .optional(),
          })
        ),
      });

      const parsedTokens = parseMcpToolResponsePayload(result, GetTokensResponseSchema);

      if (parsedTokens && Array.isArray(parsedTokens)) {
        this.tokenMap = {};
        this.availableTokens = [];

        parsedTokens.forEach(token => {
          if (token.symbol && token.tokenUid?.chainId && token.tokenUid?.address) {
            if (!this.tokenMap[token.symbol]) {
              this.tokenMap[token.symbol] = [];
              this.availableTokens.push(token.symbol);
            }
            (this.tokenMap[token.symbol] as { chainId: string; address: string }[]).push({
              chainId: token.tokenUid.chainId,
              address: token.tokenUid.address,
            });
          }
        });

        this.log(`Loaded ${this.availableTokens.length} available tokens`);
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
        parameters: GetPendleMarketsRequestSchema,
        execute: async () => {
          try {
            // First, create data artifacts for the full market data
            const dataArtifacts = this.yieldMarkets.map(market => ({
              type: 'data' as const,
              data: market,
            }));

            const task: Task = {
              id: this.userAddress!,
              status: {
                state: 'completed',
                message: {
                  role: 'agent',
                  parts: [],
                },
              },
              artifacts: [{ name: 'yield-markets', parts: dataArtifacts }],
            };
            return task;
          } catch (error: any) {
            const msg = `Error listing Pendle markets: ${error.message}`;
            logError(msg);
            return {
              id: this.userAddress!,
              status: {
                state: 'failed',
                message: { role: 'agent', parts: [{ type: 'text', text: msg }] },
              },
            };
          }
        },
      }),
      swapTokens: tool({
        description:
          'Swap tokens or acquire Pendle PT/YT tokens.',
        parameters: SwapTokensSchema,
        execute: async args => {
          this.log('Executing swap tokens tool with args:', args);
          try {
            const result = await handleSwapTokens(args, this.getHandlerContext());
            return result;
          } catch (error: any) {
            logError(`Error during swapTokens: ${error.message}`);
            // Return a failed Task on error
            return {
              id: this.userAddress!,
              status: {
                state: 'failed',
                message: {
                  role: 'agent',
                  parts: [{ type: 'text', text: `Error swapping tokens: ${error.message}` }],
                },
              },
            };
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

  async processUserInput(userInput: string, userAddress: Address): Promise<Task> {
    if (!this.toolSet) {
      throw new Error('Agent not initialized. Call start() first.');
    }
    this.userAddress = userAddress;
    this.conversationHistory.push({ role: 'user', content: userInput });

    try {
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

      // Log tool calls and results
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

      // Extract the A2A Task from the last tool result
      const toolMsg = response.messages
        .slice()
        .reverse()
        .find(msg => msg.role === 'tool' && Array.isArray(msg.content));

      if (toolMsg) {
        const toolResultPart = (toolMsg.content as ToolResultPart[]).find(
          part => part.type === 'tool-result'
        ) as ToolResultPart | undefined;
        if (toolResultPart?.result) {
          const task = toolResultPart.result as Task;
          // Clear history for terminal states
          if (['completed', 'failed', 'canceled'].includes(task.status.state)) {
            this.log(
              `Task finished with state ${task.status.state}. Clearing conversation history.`
            );
            this.conversationHistory = [];
          }
          return task;
        }
      }

      // Fallback to text-wrapped Task
      if (text) {
        return {
          id: this.userAddress!,
          status: {
            state: 'completed',
            message: { role: 'agent', parts: [{ type: 'text', text }] },
          },
        };
      }

      throw new Error('Agent processing failed: no tool result and no final text response.');
    } catch (error: any) {
      const msg = `Error calling Vercel AI SDK generateText: ${error?.message ?? error}`;
      logError(msg);
      throw error;
    }
  }

  async executeAction(actionName: string, transactions: TransactionPlan[]): Promise<string> {
    // Stub executeAction for no-wallet mode
    this.log(`Stub executeAction called for ${actionName} with transactions:`, transactions);
    return `Prepared ${transactions.length} transaction(s) for ${actionName}. No on-chain execution in no-wallet mode.`;
  }

  public async fetchMarkets(): Promise<GetYieldMarketsResponse> {
    this.log('Fetching pendle markets via MCP...');

    const result = await this.mcpClient.callTool({
      name: 'getYieldMarkets',
      arguments: {},
    });
    this.log('GetYieldMarkets tool success.');
    return parseMcpToolResponsePayload(result, GetYieldMarketsResponseSchema);
  }
}
