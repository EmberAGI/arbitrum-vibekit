import { fileURLToPath } from 'url';
import path from 'path';
import type { CoreMessage, Tool } from 'ai';
import { tool } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { generateText, type CoreUserMessage, type CoreAssistantMessage } from 'ai';
import { z } from 'zod';
import * as chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import {
  handleSupplyLiquidity,
  handleWithdrawLiquidity,
  handleGetLiquidityPools,
  handleGetWalletLiquidityPositions,
  type HandlerContext,
} from './agentToolHandlers.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize AI provider selector using environment variables for flexibility
const providerSelector = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

// Determine which providers are currently configured (based on provided API keys)
const availableProviders = getAvailableProviders(providerSelector);

if (availableProviders.length === 0) {
  throw new Error(
    'No AI providers configured. Please set at least one of: OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or HYPERBOLIC_API_KEY'
  );
}

// Allow users to specify preferred provider via AI_PROVIDER env var; otherwise use first available
const preferredProvider = process.env.AI_PROVIDER || availableProviders[0];
// Retrieve the provider factory
const selectedProvider = providerSelector[preferredProvider as keyof typeof providerSelector];

if (!selectedProvider) {
  throw new Error(
    `Preferred provider "${preferredProvider}" is not available. Available providers: ${availableProviders.join(', ')}`
  );
}

// Optionally override model via AI_MODEL env var
const modelOverride = process.env.AI_MODEL;

function logError(...args: unknown[]) {
  console.error(...args);
}

export interface AgentOptions {
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

// Liquidity-specific schemas
const SupplyLiquiditySchema = z.object({
  pair: z.string().describe('The liquidity pair to supply to, e.g., "WETH/USDC"'),
  amount0: z.string().describe('Amount of first token to supply'),
  amount1: z.string().describe('Amount of second token to supply'),
  priceFrom: z.string().describe('Minimum price for the position range'),
  priceTo: z.string().describe('Maximum price for the position range'),
});

const WithdrawLiquiditySchema = z.object({
  positionNumber: z.number().describe('The position number to withdraw (1-based index)'),
});

const GetLiquidityPoolsSchema = z.object({});
const GetWalletLiquidityPositionsSchema = z.object({});

type LiquidityToolSet = {
  supplyLiquidity: Tool<typeof SupplyLiquiditySchema, Task>;
  withdrawLiquidity: Tool<typeof WithdrawLiquiditySchema, Task>;
  getLiquidityPools: Tool<typeof GetLiquidityPoolsSchema, Task>;
  getWalletLiquidityPositions: Tool<typeof GetWalletLiquidityPositionsSchema, Task>;
};

export interface LiquidityPair {
  handle: string;
  token0: { chainId: string; address: string; symbol: string };
  token1: { chainId: string; address: string; symbol: string };
}

export interface LiquidityPosition {
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
  positionRange?: {
    fromPrice: string;
    toPrice: string;
  };
}

interface ChainConfig {
  viemChain: Chain;
  quicknodeSegment: string;
}

const quicknodeSegments: Record<string, string> = {
  '1': '',
  '42161': 'arbitrum-mainnet',
  '10': 'optimism',
  '137': 'matic',
  '8453': 'base-mainnet',
};

export function getChainConfigById(chainId: string): ChainConfig {
  const numericChainId = parseInt(chainId, 10);
  if (isNaN(numericChainId)) {
    throw new Error(`Invalid chainId format: ${chainId}`);
  }

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

  return { viemChain: viemChain as Chain, quicknodeSegment };
}

export class Agent {
  private mcpClient: Client | null = null;
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;
  private toolSet: LiquidityToolSet | null = null;
  public conversationHistory: CoreMessage[] = [];
  private userAddress?: string;
  private liquidityPairs: LiquidityPair[] = [];
  private liquidityPositions: LiquidityPosition[] = [];

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
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

  async init(): Promise<void> {
    this.setupMCPClient();

    console.error('Initializing MCP client transport...');
    try {
      if (!process.env.EMBER_ENDPOINT) {
        throw new Error('EMBER_ENDPOINT is not set');
      }
      console.error(`Connecting to MCP server at ${process.env.EMBER_ENDPOINT}`);
      const transport = new StreamableHTTPClientTransport(new URL(process.env.EMBER_ENDPOINT));

      if (!this.mcpClient) {
        throw new Error('MCP Client was not initialized before attempting connection.');
      }
      await this.mcpClient.connect(transport);
      console.error('MCP client connected successfully.');
    } catch (error) {
      console.error('Failed to initialize MCP client transport or connect:', error);
      throw new Error(`MCP Client connection failed: ${(error as Error).message}`);
    }

    this.toolSet = {
      supplyLiquidity: tool({
        description: 'Supply liquidity to a pool.',
        parameters: SupplyLiquiditySchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: supplyLiquidity', args);
          try {
            return await handleSupplyLiquidity(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during supplyLiquidity via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
      withdrawLiquidity: tool({
        description: 'Withdraw liquidity from a position.',
        parameters: WithdrawLiquiditySchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: withdrawLiquidity', args);
          try {
            return await handleWithdrawLiquidity(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during withdrawLiquidity via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
      getLiquidityPools: tool({
        description: 'Get available liquidity pools.',
        parameters: GetLiquidityPoolsSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: getLiquidityPools', args);
          try {
            return await handleGetLiquidityPools(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during getLiquidityPools via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
      getWalletLiquidityPositions: tool({
        description: 'Get user wallet liquidity positions.',
        parameters: GetWalletLiquidityPositionsSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: getWalletLiquidityPositions', args);
          try {
            return await handleGetWalletLiquidityPositions(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during getWalletLiquidityPositions via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
    };
  }

  async start() {
    await this.init();
  }

  async stop(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.close();
    }
  }

  private setupMCPClient(): void {
    this.mcpClient = new Client({
      name: 'liquidity-agent-client',
      version: '1.0.0',
    });
  }

  async processUserInput(userMessageText: string, userAddress: string): Promise<Task> {
    this.userAddress = userAddress;

    const systemPrompt = `You are a helpful AI assistant that manages liquidity positions.

You can:
- Supply liquidity to pools
- Withdraw liquidity from positions  
- Show available liquidity pools
- Show user's liquidity positions

Rules:
- Always use the exact function names and parameters as defined
- For supply operations, you need pair name, amounts, and price range
- For withdrawals, you need the position number
- Be precise with numerical values
- Always confirm operations before executing

Available tools:
- supplyLiquidity: Supply liquidity to a pair
- withdrawLiquidity: Withdraw from a position by number in the list of user positions
- getLiquidityPools: List available pools
- getWalletLiquidityPositions: Show user's positions

Rules:
- Always use the provided tools for actions or information gathering.
- For actions like supplying or withdrawing liquidity, you will receive transaction data back. Present this raw JSON transaction data clearly to the user.
- For information requests like listing pools or positions, format the data clearly for the user.
- If required parameters for a tool are missing, ask the user for clarification before attempting the tool call.
- Use the userAddress provided implicitly for all actions that require it.
- When users specify token amounts and names clearly, proceed directly with the transaction without asking for confirmation.
- Do not ask users to clarify ordering in a pair (e.g. WETH/USDC vs USDC/WETH)`;

    const userMessage: CoreUserMessage = {
      role: 'user',
      content: userMessageText,
    };

    this.conversationHistory.push(userMessage);

    if (!this.toolSet) {
      throw new Error('Tool set not initialized');
    }

    try {
      this.log('Calling generateText with Vercel AI SDK...');
      const result = await generateText({
        model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(),
        messages: [{ role: 'system', content: systemPrompt }, ...this.conversationHistory],
        tools: this.toolSet,
        maxSteps: 10,
      });

      const assistantMessage: CoreAssistantMessage = {
        role: 'assistant',
        content: result.text,
      };

      this.conversationHistory.push(assistantMessage);

      // Add messages from the response to conversation history
      if (result.response.messages && Array.isArray(result.response.messages)) {
        this.conversationHistory.push(...result.response.messages);
      }

      let finalTask: Task | null = null;
      // Process messages from the response to find tool results
      if (result.response.messages && Array.isArray(result.response.messages)) {
        for (const message of result.response.messages) {
          if (message.role === 'tool' && Array.isArray(message.content)) {
            for (const part of message.content) {
              if (
                part.type === 'tool-result' &&
                part.result &&
                typeof part.result === 'object' &&
                'id' in part.result
              ) {
                finalTask = part.result as Task;
              }
            }
          }
          if (finalTask) break;
        }
      }

      if (finalTask) {
        if (['completed', 'failed', 'canceled'].includes(finalTask.status.state)) {
          this.conversationHistory = [];
        }
        return finalTask;
      }

      // If no tool was called, return text response
      const task: Task = {
        id: userAddress,
        contextId: `liquidity-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Completed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [
              { kind: 'text', text: result.text || "I'm sorry, I couldn't process that request." },
            ],
          },
        },
      };

      return task;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`Error during processUserInput: ${errorMessage}`);

      return {
        id: userAddress,
        contextId: `error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `Error: ${errorMessage}` }],
          },
        },
      };
    }
  }

  private getHandlerContext(): HandlerContext {
    if (!this.mcpClient) {
      throw new Error('MCP client not initialized');
    }
    return {
      mcpClient: this.mcpClient,
      userAddress: this.userAddress,
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
      log: console.error,
      getPairs: () => this.liquidityPairs,
      updatePairs: (pairs: LiquidityPair[]) => {
        this.liquidityPairs = pairs;
      },
      getPositions: () => this.liquidityPositions,
      updatePositions: (positions: LiquidityPosition[]) => {
        this.liquidityPositions = positions;
      },
    };
  }
}
