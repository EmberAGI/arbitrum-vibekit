import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Task } from 'a2a-samples-js';
import { promises as fs } from 'fs';
import path, { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  generateText,
  tool,
  type Tool,
  type CoreMessage,
  type CoreUserMessage,
  type CoreAssistantMessage,
  type StepResult,
  type LanguageModelV1,
} from 'ai';
import {
  GetLendingReservesResponseSchema,
  BorrowRepaySupplyWithdrawSchema,
  GetUserPositionsSchema,
  AskEncyclopediaSchema,
  type GetLendingReservesResponse,
  type TokenIdentifier,
  type LendTokenDetail,
  LendTokenDetailSchema,
  type GetWalletPositionsResponse,
} from 'ember-schemas';
import * as chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import {
  handleBorrow,
  handleRepay,
  handleSupply,
  handleWithdraw,
  handleGetUserPositions,
  handleAskEncyclopedia,
  type HandlerContext,
} from './agentToolHandlers.js';
import { createProviderSelector } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { createPublicClient, http, type Address } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '.cache', 'lending_capabilities.json');

const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
});

const model = providers.openrouter!('google/gemini-2.5-flash-preview');

function logError(...args: unknown[]) {
  console.error(...args);
}

export interface AgentOptions {
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

type LendingToolSet = {
  borrow: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  repay: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  supply: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  withdraw: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  getUserPositions: Tool<typeof GetUserPositionsSchema, Task>;
  askEncyclopedia: Tool<typeof AskEncyclopediaSchema, Task>;
};

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
  private tokenMap: Record<string, Array<TokenIdentifier>> = {};
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;
  private availableTokens: string[] = [];
  public conversationHistory: CoreMessage[] = [];
  private aaveContextContent: string = '';
  private model: LanguageModelV1;

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;
    this.model = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    })('google/gemini-2.5-flash-preview');
  }

  async init(): Promise<void> {
    this.setupMCPClient();

    console.error('Initializing MCP client transport...');
    try {
      if (!process.env.EMBER_ENDPOINT) {
        throw new Error('EMBER_ENDPOINT not set!');
      }
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

    await this.setupTokenMap();
    await this._loadAaveDocumentation();

    console.error('Agent initialized. Token map populated dynamically via MCP capabilities.');
    console.error('Available tokens:', this.availableTokens.join(', ') || 'None loaded');
    console.error('Tools initialized for Vercel AI SDK.');
  }

  async start() {
    await this.init();
    console.error('Agent started.');
  }

  async stop(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.close();
    }
  }

  private async fetchAndCacheCapabilities(): Promise<GetLendingReservesResponse> {
    const useCache = process.env.AGENT_CACHE_TOKENS === 'true';
    const cacheDir = dirname(CACHE_FILE_PATH);
    if (useCache) {
      try {
        await fs.mkdir(cacheDir, { recursive: true });
        const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
        console.error('Using cached lending capabilities.');
        return JSON.parse(cachedData);
      } catch (_err) {
        console.error('Cached capabilities not found or unreadable. Fetching fresh data...');
      }
    }

    // Fetch fresh capabilities
    if (!this.mcpClient) {
      throw new Error('MCP client is not initialized.');
    }
    console.error('Fetching fresh lending capabilities via MCP tool...');
    const capabilitiesResult = await this.mcpClient.callTool({
      name: 'getLendingReserves',
      arguments: {},
    });

    const parsedResult = GetLendingReservesResponseSchema.parse(capabilitiesResult);

    // Cache the response if caching is enabled
    if (useCache) {
      try {
        await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(parsedResult, null, 2), 'utf-8');
        console.error('Cached fresh lending capabilities to disk.');
      } catch (writeErr) {
        console.error('Failed to write capabilities cache:', writeErr);
      }
    }
    return parsedResult;
  }

  private async setupTokenMap(): Promise<void> {
    try {
      const capabilities = await this.fetchAndCacheCapabilities();
      console.error('setting up token map with capabilities:', capabilities);
      this.availableTokens = capabilities.reserves.map(reserve => reserve.symbol);

      const tokenMap: Record<string, Array<TokenIdentifier>> = {};
      for (const reserve of capabilities.reserves) {
        const token: TokenIdentifier = {
          address: reserve.tokenUid.address,
          chainId: reserve.tokenUid.chainId,
        };

        const upperSymbol = reserve.symbol.toUpperCase();
        if (!tokenMap[upperSymbol]) {
          tokenMap[upperSymbol] = [];
        }
        tokenMap[upperSymbol]!.push(token);
      }
      this.tokenMap = tokenMap;
    } catch (error) {
      console.error('Failed to setup token map:', error);
      throw new Error(`Failed to initialize token map: ${(error as Error).message}`);
    }
  }

  private setupMCPClient(): void {
    if (!this.mcpClient) {
      this.mcpClient = new Client({ name: 'LendingAgentNoWallet', version: '1.0.0' });
      console.error('MCP Client initialized.');
    }
  }

  async processUserInput(userMessageText: string, userAddress: string): Promise<Task> {
    // Ensure MCP client is ready
    if (!this.mcpClient) {
      throw new Error('MCP client is not initialized. Call init() first.');
    }

    const userMessage: CoreUserMessage = { role: 'user', content: userMessageText };
    this.conversationHistory.push(userMessage);

    // Build tool set per invocation to capture current userAddress explicitly
    const toolSet = {
      borrow: tool({
        description: 'Borrow a token.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => handleBorrow(args, this.getHandlerContext(userAddress)),
      }),
      repay: tool({
        description: 'Repay a borrowed token.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => handleRepay(args, this.getHandlerContext(userAddress)),
      }),
      supply: tool({
        description: 'Supply (deposit) a token.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => handleSupply(args, this.getHandlerContext(userAddress)),
      }),
      withdraw: tool({
        description: 'Withdraw a previously supplied token.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => handleWithdraw(args, this.getHandlerContext(userAddress)),
      }),
      getUserPositions: tool({
        description: 'Get a summary of your current lending and borrowing positions.',
        parameters: GetUserPositionsSchema,
        execute: async args => handleGetUserPositions(args, this.getHandlerContext(userAddress)),
      }),
      askEncyclopedia: tool({
        description: 'Ask a question about Aave.',
        parameters: AskEncyclopediaSchema,
        execute: async args => handleAskEncyclopedia(args, this.getHandlerContext(userAddress)),
      }),
    } as const;

    try {
      console.error('Calling generateText with Vercel AI SDK...');
      const { text, toolResults, finishReason, response } = await generateText({
        model: this.model,
        system: this.conversationHistory.find(m => m.role === 'system')?.content as string,
        messages: this.conversationHistory.filter(m => m.role !== 'system') as (
          | CoreUserMessage
          | CoreAssistantMessage
        )[],
        tools: toolSet,
        maxSteps: 5,
        onStepFinish: async (stepResult: StepResult<typeof toolSet>) => {
          console.error(`Step finished. Reason: ${stepResult.finishReason}`);
        },
      });
      console.error(`generateText finished. Reason: ${finishReason}`);
      console.error(`LLM response text: ${text}`);

      // Add messages from the response to conversation history
      if (response.messages && Array.isArray(response.messages)) {
        this.conversationHistory.push(...response.messages);
      }

      let finalTask: Task | null = null;
      // Process messages from the response
      if (response.messages && Array.isArray(response.messages)) {
        for (const message of response.messages) {
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

      console.error('No tool called or task found, returning text response.');
      return {
        id: userAddress,
        status: {
          state: 'completed',
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
      return {
        id: userAddress,
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

  private getHandlerContext(userAddress: string | undefined): HandlerContext {
    return {
      mcpClient: this.mcpClient!,
      tokenMap: this.tokenMap,
      log: console.error,
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
      userAddress,
      openRouterApiKey: process.env.OPENROUTER_API_KEY!,
      aaveContextContent: this.aaveContextContent,
    };
  }

  private async _loadAaveDocumentation(): Promise<void> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const docsPath = join(__dirname, '../encyclopedia');
    const filePaths = [join(docsPath, 'aave-01.md'), join(docsPath, 'aave-02.md')];
    let combinedContent = '';

    console.error(`Loading Aave documentation from: ${docsPath}`);

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        combinedContent += `\n\n--- Content from ${path.basename(filePath)} ---\n\n${content}`;
        console.error(`Successfully loaded ${path.basename(filePath)}`);
      } catch (error) {
        logError(`Warning: Could not load or read Aave documentation file ${filePath}:`, error);
        combinedContent += `\n\n--- Failed to load ${path.basename(filePath)} ---`;
      }
    }
    this.aaveContextContent = combinedContent;
    if (!this.aaveContextContent.trim()) {
      logError('Warning: Aave documentation context is empty after loading attempts.');
    }
  }

  /**
   * Extract positions data from response
   */
  private extractPositionsData(response: Task): GetWalletPositionsResponse {
    if (!response.artifacts) {
      throw new Error(
        `No artifacts found in response. Response: ${JSON.stringify(response, null, 2)}`
      );
    }

    // Look for positions artifact (support both legacy and new names)
    for (const artifact of response.artifacts) {
      if (artifact.name === 'positions' || artifact.name === 'wallet-positions') {
        for (const part of artifact.parts || []) {
          if (part.type === 'data' && part.data?.positions) {
            return part.data as GetWalletPositionsResponse;
          }
        }
      }
    }

    throw new Error(
      `No positions data found in artifacts. Response: ${JSON.stringify(response, null, 2)}`
    );
  }

  /**
   * Finds the reserve information for a given token symbol or name within the positions response.
   */
  private getReserveForToken(
    response: GetWalletPositionsResponse,
    tokenNameOrSymbol: string
  ): LendTokenDetail {
    const upperTokenName = tokenNameOrSymbol.toUpperCase();

    for (const pos of response.positions) {
      if (pos.type === 'lending') {
        for (const reserve of pos.lendingPosition.userReserves) {
          const tokenSymbol = reserve.token.symbol.toUpperCase();
          const tokenName = reserve.token.name.toUpperCase();
          if (tokenSymbol === upperTokenName || tokenName === upperTokenName) {
            return LendTokenDetailSchema.parse(reserve);
          }
        }
      }
    }

    throw new Error(`Could not find a reserve for token: ${tokenNameOrSymbol}`);
  }

  /**
   * Helper to get reserve for a token
   */
  async getTokenReserve(userAddress: string, tokenName: string): Promise<LendTokenDetail> {
    const task = await this.processUserInput('get positions', userAddress);
    const positions = this.extractPositionsData(task);
    return this.getReserveForToken(positions, tokenName);
  }
}
