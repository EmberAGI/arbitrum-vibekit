import { z } from 'zod';
import { type Address } from 'viem';
import {
  handleSupplyLiquidity,
  handleWithdrawLiquidity,
  handleGetLiquidityPools,
  handleGetUserLiquidityPositions,
  type HandlerContext,
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
import type { Task } from 'a2a-samples-js/schema';
import { createRequire } from 'module';
import * as chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import {
  GetLiquidityPoolsAgentResponseSchema,
  SupplyLiquiditySchema,
  WithdrawLiquiditySchema,
  GetLiquidityPoolsSchema,
  GetUserLiquidityPositionsSchema,
} from 'ember-schemas';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

function logError(...args: unknown[]) {
  console.error(...args);
}

interface ChainConfig {
  viemChain: Chain;
  quicknodeSegment: string;
}

const quicknodeSegments: Record<string, string> = {
  '1': '', // Ethereum mainnet
  '42161': 'arbitrum-mainnet', // Arbitrum One
  '10': 'optimism', // Optimism
  '137': 'matic', // Polygon PoS
  '8453': 'base-mainnet', // Base
  // Add other chains supported by your QuickNode plan and the agent if needed
};

export function getChainConfigById(chainId: string): ChainConfig {
  const numericChainId = parseInt(chainId, 10);
  if (isNaN(numericChainId)) {
    throw new Error(`Invalid chainId format: ${chainId}`);
  }

  // Find the Viem chain object based on the numeric ID
  const viemChain = Object.values(chains).find(
    chain => chain && typeof chain === 'object' && 'id' in chain && chain.id === numericChainId
  );

  if (!viemChain) {
    throw new Error(
      `Unsupported chainId: ${chainId}. Viem chain definition not found in imported chains.`
    );
  }

  const quicknodeSegment = quicknodeSegments[chainId];

  if (quicknodeSegment === undefined) {
    throw new Error(
      `Unsupported chainId: ${chainId}. QuickNode segment not configured in quicknodeSegments map.`
    );
  }

  // We need to cast viemChain because Object.values(chains) includes non-Chain types if not filtered carefully
  return { viemChain: viemChain as Chain, quicknodeSegment };
}

type TokenIdentifier = {
  chainId: string;
  address: string;
  symbol?: string;
};

export type LiquidityPair = {
  handle: string;
  symbol0: string;
  symbol1: string;
  token0: TokenIdentifier;
  token1: TokenIdentifier;
  price: string;
};

export type LiquidityPosition = {
  tokenId: string;
  poolAddress: string;
  operator: string;
  token0: { chainId: string; address: string };
  token1: { chainId: string; address: string };
  tokensOwed0: string;
  tokensOwed1: string;
  amount0: string;
  amount1: string;
  symbol0: string;
  symbol1: string;
  price: string;
  providerId: string;
  positionRange: { fromPrice: string; toPrice: string };
};
// Define the extended schema with concrete values
type SupplyLiquidityExtendedSchema = z.ZodObject<{
  pair: z.ZodEnum<[string, ...string[]]>;
  amount0: z.ZodString;
  amount1: z.ZodString;
  priceFrom: z.ZodString;
  priceTo: z.ZodString;
}>;

type LiquidityToolSet = {
  supplyLiquidity: Tool<
    SupplyLiquidityExtendedSchema,
    Task
  >;
  withdrawLiquidity: Tool<
    typeof WithdrawLiquiditySchema,
    Task
  >;
  getLiquidityPools: Tool<
    typeof GetLiquidityPoolsSchema,
    Task
  >;
  getUserLiquidityPositions: Tool<
    typeof GetUserLiquidityPositionsSchema,
    Task
  >;
};

export class Agent {
  private userAddress: Address | undefined;
  public conversationHistory: CoreMessage[] = [];
  private mcpClient: Client | null = null;
  private toolSet: LiquidityToolSet | null = null;
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;

  private pairs: LiquidityPair[] = [];
  private positions: LiquidityPosition[] = [];

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set!');
    }
    if (!quicknodeSubdomain) {
      throw new Error('quicknodeSubdomain is required!');
    }
    if (!quicknodeApiKey) {
      throw new Error('quicknodeApiKey is required!');
    }
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
      userAddress: this.userAddress,
      log: this.log.bind(this),
      getPairs: () => this.pairs,
      getPositions: () => this.positions,
      updatePositions: positions => {
        this.positions = positions;
      },
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
    };
    return context;
  }

  async init() {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an AI agent that provides access to blockchain liquidity management functions via Ember AI On-chain Actions, accessed through connected MCP tools.

You can:
- Supply liquidity to a pair using the "supplyLiquidity" tool.
- Withdraw liquidity from a position using the "withdrawLiquidity" tool.
- List available liquidity pools using the "getLiquidityPools" tool.
- List your current liquidity positions using the "getUserLiquidityPositions" tool.

Rules:
- Always use the provided tools for actions or information gathering.
- For actions like supplying or withdrawing liquidity, you will receive transaction data back. Present this raw JSON transaction data clearly to the user.
- For information requests like listing pools or positions, format the data clearly for the user.
- If required parameters for a tool are missing, ask the user for clarification before attempting the tool call.
- Use the userAddress provided implicitly for all actions that require it.

<Supply Liquidity Example>
<user>Supply 1 WETH and 2000 USDC to the WETH/USDC pool between price 1800 and 2200</user>
<tool_call> {"toolName": "supplyLiquidity", "args": { "pair": "WETH/USDC", "amount0": "1", "amount1": "2000", "priceFrom": "1800", "priceTo": "2200" }} </tool_call>
*Note: You need to look up the token addresses and chain IDs from the fetched pools based on the 'pair' handle.*

<Withdraw Liquidity Example>
<user>Withdraw my first liquidity position</user>
<tool_call> {"toolName": "withdrawLiquidity", "args": { "positionNumber": 1 }} </tool_call>
*Note: You need to look up the tokenId and providerId from the fetched user positions based on the 'positionNumber'.*

<Get Positions Example>
<user>Show my liquidity positions</user>
<tool_call> {"toolName": "getUserLiquidityPositions", "args": {}} </tool_call>

<Get Pools Example>
<user>List the available liquidity pools</user>
<tool_call> {"toolName": "getLiquidityPools", "args": {}} </tool_call>
`,
      },
    ];

    this.log('Initializing MCP client via stdio...');
    try {
      this.mcpClient = new Client(
        { name: 'LiquidityAgent', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      const require = createRequire(import.meta.url);
      const mcpToolPath = require.resolve('ember-mcp-tool-server');

      this.log(`Connecting to MCP server via stdio: ${mcpToolPath}`);

      const transport = new StdioClientTransport({
        command: 'node',
        args: [mcpToolPath],
        env: {
          ...process.env,
          EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? '',
        },
      });

      await this.mcpClient.connect(transport);
      this.log('MCP client initialized and connected successfully.');

      this.log('Fetching liquidity pools via MCP...');
      const getPoolsResponse = await this.mcpClient.callTool({
        name: 'getLiquidityPools',
        arguments: {},
      });

      if (
        getPoolsResponse.isError ||
        !getPoolsResponse.content ||
        !Array.isArray(getPoolsResponse.content) ||
        getPoolsResponse.content.length === 0 ||
        !getPoolsResponse.content[0] ||
        getPoolsResponse.content[0].type !== 'text' ||
        typeof getPoolsResponse.content[0].text !== 'string'
      ) {
        logError(
          'Error fetching liquidity pools via MCP:',
          (Array.isArray(getPoolsResponse.content)
            ? getPoolsResponse.content[0]?.text
            : undefined) || 'Unknown error or invalid/non-text/empty response'
        );
        throw new Error('Failed to fetch liquidity pools.');
      }

      const poolsJson = getPoolsResponse.content[0].text;
      this.log('Received pools JSON string:', poolsJson.substring(0, 500) + '...');

      try {
        // Parse and validate the JSON using the Zod schema
        const parsedPoolsData = GetLiquidityPoolsAgentResponseSchema.parse(JSON.parse(poolsJson));
        this.log(`Validated ${parsedPoolsData.liquidityPools.length} pools from MCP response.`);

        // Populate internal `this.pairs` state from validated data
        this.pairs = parsedPoolsData.liquidityPools.map(
          (pool): LiquidityPair => ({
            handle: `${pool.symbol0}/${pool.symbol1}`,
            symbol0: pool.symbol0,
            symbol1: pool.symbol1,
            token0: {
              chainId: pool.token0.chainId,
              address: pool.token0.address,
            },
            token1: {
              chainId: pool.token1.chainId,
              address: pool.token1.address,
            },
            price: pool.price,
          })
        );

        this.log(`Processed ${this.pairs.length} liquidity pairs for internal state.`);
        this.log('First few internal pairs:', JSON.stringify(this.pairs.slice(0, 3), null, 2));
      } catch (error) {
        logError('Error parsing/validating liquidity pools JSON response:', error);
        if (error instanceof z.ZodError) {
          logError('Zod validation errors:', JSON.stringify(error.errors, null, 2));
        }
        logError('Raw JSON string that failed parsing:', poolsJson);
        throw new Error('Failed to parse/validate liquidity pools response.');
      }

      // --- Define ToolSet ---
      // Define the *actual* dynamic schema using fetched pairs
      const dynamicSupplyLiquiditySchema = SupplyLiquiditySchema.extend({
        pair: z
          .enum(this.pairs.map(p => p.handle) as [string, ...string[]])
          .describe('The handle for the liquidity pair (e.g., WETH/USDC).'),
      });

      // Initialize toolSet using the actual dynamic schema
      this.toolSet = {
        supplyLiquidity: tool({
          description: 'Supply liquidity to a pair, optionally within a specified price range.',
          parameters: dynamicSupplyLiquiditySchema,
          execute: async args => handleSupplyLiquidity(args, this.getHandlerContext()),
        }),
        withdrawLiquidity: tool({
          description: 'Withdraw a liquidity position by its number.',
          parameters: WithdrawLiquiditySchema,
          execute: async args => handleWithdrawLiquidity(args, this.getHandlerContext()),
        }),
        getLiquidityPools: tool({
          description: 'List available liquidity pools.',
          parameters: GetLiquidityPoolsSchema,
          execute: async () => handleGetLiquidityPools({}, this.getHandlerContext()),
        }),
        getUserLiquidityPositions: tool({
          description: 'List your current liquidity positions.',
          parameters: GetUserLiquidityPositionsSchema,
          execute: async () => handleGetUserLiquidityPositions({}, this.getHandlerContext()),
        }),
      };
      this.log('Toolset defined with liquidity tools.');
      // --- End Define ToolSet ---
    } catch (error) {
      logError('Failed during agent initialization:', error);
      throw new Error(
        `Agent initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.log('Agent initialized successfully.');
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

  async processUserInput(userInput: string, userAddress: Address): Promise<Task> {
    if (!this.toolSet) {
      throw new Error('Agent not initialized. Call start() first.');
    }
    this.userAddress = userAddress;
    const userMessage: CoreUserMessage = { role: 'user', content: userInput };
    this.conversationHistory.push(userMessage);

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

      const lastToolResultMessage = response.messages
        .slice()
        .reverse()
        .find(msg => msg.role === 'tool' && Array.isArray(msg.content));

      let processedToolResult: Task | null = null;

      if (
        lastToolResultMessage &&
        lastToolResultMessage.role === 'tool' &&
        Array.isArray(lastToolResultMessage.content)
      ) {
        const toolResultPart = lastToolResultMessage.content.find(
          part => part.type === 'tool-result'
        ) as ToolResultPart | undefined;

        if (toolResultPart) {
          this.log(`Processing tool result for ${toolResultPart.toolName} from response.messages`);
          if (toolResultPart.result != null) {
            processedToolResult = toolResultPart.result as Task;
            this.log(`Tool Result State: ${processedToolResult?.status?.state ?? 'N/A'}`);
            const firstPart = processedToolResult?.status?.message?.parts[0];
            const messageText = firstPart && firstPart.type === 'text' ? firstPart.text : 'N/A';
            this.log(`Tool Result Message: ${messageText}`);
          } else {
            this.log('Tool result part content is null or undefined.');
          }
        } else {
          this.log('No tool-result part found in the last tool message.');
        }
      } else {
        this.log('No tool message found in the response.');
      }

      if (processedToolResult) {
        switch (processedToolResult.status.state) {
          case 'completed':
          case 'failed':
          case 'canceled':
            this.log(
              `Task finished with state ${processedToolResult.status.state}. Clearing conversation history.`
            );
            this.conversationHistory = [];
            return processedToolResult;
          case 'input-required':
          case 'submitted':
          case 'working':
          case 'unknown':
            return processedToolResult;
          default:
            this.log(`Unexpected task state: ${processedToolResult.status.state}`);
            return {
              id: this.userAddress || 'unknown-user',
              status: {
                state: 'failed',
                message: {
                  role: 'agent',
                  parts: [
                    {
                      type: 'text',
                      text: `Agent encountered unexpected task state: ${processedToolResult.status.state}`,
                    },
                  ],
                },
              },
            };
        }
      }

      if (text) {
        this.log(
          'No specific tool task processed or returned. Returning final text response as completed task.'
        );
        return {
          id: this.userAddress,
          status: {
            state: 'completed',
            message: { role: 'agent', parts: [{ type: 'text', text: text }] },
          },
        };
      }

      throw new Error(
        'Agent processing failed: No tool result task processed and no final text response available.'
      );
    } catch (error) {
      const errorLog = `Error calling Vercel AI SDK generateText: ${error}`;
      logError(errorLog);
      const errorAssistantMessage: CoreAssistantMessage = {
        role: 'assistant',
        content: String(error),
      };
      this.conversationHistory.push(errorAssistantMessage);
      throw error;
    }
  }
}
