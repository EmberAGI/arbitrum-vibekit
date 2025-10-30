import { fileURLToPath } from 'url';
import path from 'path';
import type { CoreMessage, LanguageModelV1, Tool } from 'ai';
import { tool } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { promises as fs } from 'fs';
import { generateText, type CoreUserMessage, type CoreAssistantMessage, type StepResult } from 'ai';
import {
  LendingGetCapabilitiesResponseSchema,
  BorrowRepaySupplyWithdrawSchema,
  GetWalletLendingPositionsSchema,
  LendingAskEncyclopediaSchema,
  type LendingGetCapabilitiesResponse,
  type TokenInfo,
  type UserReserve,
  UserReserveSchema,
  type GetWalletLendingPositionsResponse,
} from '@emberai/arbitrum-vibekit-core/ember-schemas';
import * as chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import {
  handleBorrow,
  handleRepay,
  handleSupply,
  handleWithdraw,
  handleGetWalletLendingPositions,
  handleAskEncyclopedia,
  type HandlerContext,
} from './agentToolHandlers.js';
import { createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '.cache', 'lending_capabilities.json');

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

type LendingToolSet = {
  borrow: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  repay: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  supply: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  withdraw: Tool<typeof BorrowRepaySupplyWithdrawSchema, Task>;
  getUserPositions: Tool<typeof GetWalletLendingPositionsSchema, Task>;
  askEncyclopedia: Tool<typeof LendingAskEncyclopediaSchema, Task>;
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
  private tokenMap: Record<string, Array<TokenInfo>> = {};
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;
  private availableTokens: string[] = [];
  private toolSet: LendingToolSet | null = null;
  public conversationHistory: CoreMessage[] = [];
  private userAddress?: string;
  private aaveContextContent: string = '';
  private provider: (model?: string) => LanguageModelV1;

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;
    this.provider = selectedProvider!;
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

    await this.setupTokenMap();
    await this._loadAaveDocumentation();

    this.toolSet = {
      borrow: tool({
        description: 'Borrow a token.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: borrow', args);
          try {
            return await handleBorrow(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during borrow via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
      repay: tool({
        description: 'Repay a borrowed token.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: repay', args);
          try {
            return await handleRepay(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during repay via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
      supply: tool({
        description: 'Supply (deposit) a token.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: supply', args);
          try {
            return await handleSupply(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during supply via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
      withdraw: tool({
        description: 'Withdraw a previously supplied token.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: withdraw', args);
          try {
            return await handleWithdraw(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during withdraw via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
      getUserPositions: tool({
        description: 'Get a summary of your current lending and borrowing positions.',
        parameters: GetWalletLendingPositionsSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: getUserPositions', args);
          try {
            return await handleGetWalletLendingPositions(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during getUserPositions via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
      askEncyclopedia: tool({
        description:
          'Ask a question about Aave to retrieve specific information about the protocol using embedded documentation.',
        parameters: LendingAskEncyclopediaSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: askEncyclopedia', args);
          try {
            return await handleAskEncyclopedia(args, this.getHandlerContext());
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError(`Error during askEncyclopedia via toolSet: ${errorMessage}`);
            throw error;
          }
        },
      }),
    };

    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an AI agent providing access to blockchain lending capabilities via Ember AI On-chain Actions, using Aave and other lending protocols.

Available actions: borrow, repay, supply, withdraw, getUserPositions, askEncyclopedia.

Only use tools if the user explicitly asks to perform an action. Ensure all required parameters for a tool are available from the user's request or conversation history before calling the tool.
If parameters are missing, ask the user to provide them. Do not assume parameters.

IMPORTANT: Always call the appropriate tool with the exact parameters provided by the user. Do not make assumptions about minimum amounts, protocol limitations, or other restrictions. Let the tool handle all validation. Never refuse to call a tool based on the amount value - always pass it through to the tool.

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
</example5>

<example6 - Ask Encyclopedia>
<user>What is the liquidation threshold for WETH on Aave Arbitrum?</user>
<tool_call> {"toolName": "askEncyclopedia", "args": { "question": "What is the liquidation threshold for WETH on Aave Arbitrum?" }} </tool_call>
</example6>

<example7 - Small Amount Borrow>
<user>Borrow 0.001 USDC</user>
<tool_call> {"toolName": "borrow", "args": { "tokenName": "USDC", "amount": "0.001" }} </tool_call>
</example7>
</examples>

Always use plain text. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason. Present the user with a list of tokens/chains if clarification is needed (as handled by the tool).`,
      },
    ];
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

  private async fetchAndCacheCapabilities(): Promise<LendingGetCapabilitiesResponse> {
    if (!this.mcpClient) {
      throw new Error('MCP Client not initialized. Cannot fetch capabilities.');
    }

    console.error('Fetching lending capabilities via MCP tool call...');
    try {
      const mcpTimeoutMs = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || '30000', 10);
      console.error(`Using MCP tool timeout: ${mcpTimeoutMs}ms`);

      const capabilitiesResult = await this.mcpClient.callTool(
        {
          name: 'getCapabilities',
          arguments: { type: 'LENDING_MARKET' },
        },
        undefined,
        { timeout: mcpTimeoutMs }
      );

      console.error('Raw capabilitiesResult received from MCP tool call.');

      // Check if the response has structuredContent directly (new format)
      if (
        capabilitiesResult &&
        typeof capabilitiesResult === 'object' &&
        'structuredContent' in capabilitiesResult
      ) {
        const parsedData = (capabilitiesResult as { structuredContent: unknown }).structuredContent;

        const capabilitiesValidationResult =
          LendingGetCapabilitiesResponseSchema.safeParse(parsedData);

        if (!capabilitiesValidationResult.success) {
          logError(
            'Parsed MCP getCapabilities response validation failed. Zod Error:',
            JSON.stringify(capabilitiesValidationResult.error.format(), null, 2)
          );
          throw new Error(
            `Failed to validate the parsed capabilities data from MCP server tool. Complete response: ${JSON.stringify(capabilitiesResult, null, 2)}`
          );
        }

        const validatedData = capabilitiesValidationResult.data;
        console.error(`Validated ${validatedData.capabilities.length} capabilities.`);

        const useCache = process.env.AGENT_CACHE_TOKENS === 'true';
        if (useCache) {
          try {
            await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
            await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(validatedData, null, 2));
            console.error('Cached validated capabilities response to', CACHE_FILE_PATH);
          } catch (err) {
            console.error('Failed to cache capabilities response:', err);
          }
        }

        return validatedData;
      }

      // If no structuredContent, throw error
      throw new Error(
        `MCP getCapabilities tool returned an unexpected structure. Expected { structuredContent: { capabilities: [...] } }. Complete response: ${JSON.stringify(capabilitiesResult, null, 2)}`
      );
    } catch (error) {
      logError('Error calling getCapabilities tool or processing response:', error);
      throw new Error(
        `Failed to fetch/validate capabilities via MCP tool: ${(error as Error).message}`
      );
    }
  }

  private async setupTokenMap(): Promise<void> {
    let capabilitiesResponse: LendingGetCapabilitiesResponse | undefined;
    const useCache = process.env.AGENT_CACHE_TOKENS === 'true';

    if (useCache) {
      try {
        await fs.access(CACHE_FILE_PATH);
        console.error('Loading lending capabilities from cache...');
        const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
        const parsedJson = JSON.parse(cachedData);
        const validationResult = LendingGetCapabilitiesResponseSchema.safeParse(parsedJson);
        if (validationResult.success) {
          capabilitiesResponse = validationResult.data;
          console.error('Cached capabilities loaded and validated successfully.');
        } else {
          logError('Cached capabilities validation failed:', validationResult.error);
          logError('Cached data that failed validation:', JSON.stringify(parsedJson));
          console.error('Proceeding to fetch fresh capabilities...');
        }
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('ENOENT') || error instanceof SyntaxError)
        ) {
          console.error('Cache not found or invalid, fetching fresh capabilities...');
        } else {
          logError('Error reading or parsing cache file:', error);
          console.error('Proceeding to fetch fresh capabilities despite cache read error...');
        }
      }
    }

    if (!capabilitiesResponse) {
      try {
        capabilitiesResponse = await this.fetchAndCacheCapabilities();
      } catch (fetchError) {
        logError('Failed to fetch capabilities, token map will be empty:', fetchError);
        this.tokenMap = {};
        this.availableTokens = [];
        return;
      }
    }

    // Process capabilities to populate token map
    this.tokenMap = {};
    this.availableTokens = [];
    let loadedTokenCount = 0;
    let processedCapabilityCount = 0;

    if (capabilitiesResponse?.capabilities) {
      console.error(
        `Processing ${capabilitiesResponse.capabilities.length} capabilities entries...`
      );
      capabilitiesResponse.capabilities.forEach((capabilityEntry, _index) => {
        if (capabilityEntry.lendingCapability) {
          processedCapabilityCount++;
          const lendingCap = capabilityEntry.lendingCapability;
          const token = lendingCap.underlyingToken;

          // Check if token has all required data (skip empty/incomplete tokens)
          if (
            token &&
            token.symbol &&
            token.symbol.trim() &&
            token.tokenUid?.chainId &&
            token.tokenUid?.address
          ) {
            const symbol = token.symbol.trim();
            const tokenInfo: TokenInfo = {
              chainId: token.tokenUid.chainId,
              address: token.tokenUid.address,
              decimals: token.decimals ?? 18,
            };

            if (!this.tokenMap[symbol]) {
              this.tokenMap[symbol] = [tokenInfo];
              this.availableTokens.push(symbol);
              loadedTokenCount++;
            } else {
              const exists = this.tokenMap[symbol].some(
                t =>
                  t.chainId === tokenInfo.chainId &&
                  t.address.toLowerCase() === tokenInfo.address.toLowerCase()
              );
              if (!exists) {
                this.tokenMap[symbol].push(tokenInfo);
              }
            }
          } else {
            console.error('Skipping capability with incomplete token data:', {
              symbol: token?.symbol,
              chainId: token?.tokenUid?.chainId,
              address: token?.tokenUid?.address,
            });
          }
        }
      });
      console.error(
        `Finished processing capabilities. Processed ${processedCapabilityCount} lending capabilities. Found ${loadedTokenCount} unique token symbols.`
      );
    } else {
      logError('No capabilities array found in the response, token map will be empty.');
    }

    if (Object.keys(this.tokenMap).length === 0) {
      console.warn(
        'Warning: Token map is empty after processing capabilities. This may indicate the server is returning capabilities with empty token symbols.'
      );
    } else {
      console.error(`Successfully loaded tokens: ${this.availableTokens.join(', ')}`);
    }
  }

  private setupMCPClient(): void {
    if (!this.mcpClient) {
      this.mcpClient = new Client({ name: 'LendingAgentNoWallet', version: '1.0.0' });
      console.error('MCP Client initialized.');
    }
  }

  async processUserInput(userMessageText: string, userAddress: string): Promise<Task> {
    if (!this.toolSet) {
      throw new Error('Agent not initialized. Call init() first.');
    }
    this.userAddress = userAddress;

    const userMessage: CoreUserMessage = { role: 'user', content: userMessageText };
    this.conversationHistory.push(userMessage);

    try {
      console.error('Calling generateText with Vercel AI SDK...');
      const {
        text,
        toolResults: _toolResults,
        finishReason,
        response,
      } = await generateText({
        model: modelOverride ? this.provider(modelOverride) : this.provider(),
        system: this.conversationHistory.find(m => m.role === 'system')?.content as string,
        messages: this.conversationHistory.filter(m => m.role !== 'system') as (
          | CoreUserMessage
          | CoreAssistantMessage
        )[],
        tools: this.toolSet,
        maxSteps: 5,
        onStepFinish: async (stepResult: StepResult<typeof this.toolSet>) => {
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
        id: this.userAddress!,
        contextId: `text-response-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Completed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: text || "I'm sorry, I couldn't process that request." }],
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
        id: this.userAddress!,
        contextId: `error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `An error occurred: ${String(error)}` }],
          },
        },
      };
    }
  }

  private getHandlerContext(): HandlerContext {
    console.error('userAddress', this.userAddress);
    return {
      mcpClient: this.mcpClient!,
      tokenMap: this.tokenMap,
      userAddress: this.userAddress,
      log: console.error,
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
      openRouterApiKey: process.env.OPENROUTER_API_KEY!,
      aaveContextContent: this.aaveContextContent,
      provider: this.provider,
    };
  }

  private async _loadAaveDocumentation(): Promise<void> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const docsPath = path.join(__dirname, '../encyclopedia');
    const filePaths = [path.join(docsPath, 'aave-01.md'), path.join(docsPath, 'aave-02.md')];
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
   * Extract positions data from response and populate token map
   */
  private extractPositionsData(response: Task): GetWalletLendingPositionsResponse {
    // First try to extract from artifacts (successful response)
    if (response.artifacts) {
      // Look for positions artifact (support both legacy and new names)
      for (const artifact of response.artifacts) {
        if (artifact.name === 'positions' || artifact.name === 'wallet-positions') {
          for (const part of artifact.parts) {
            if (part.kind === 'data' && part.data?.positions) {
              const positionsData = part.data as GetWalletLendingPositionsResponse;
              this.populateTokenMapFromPositions(positionsData);
              return positionsData;
            }
          }
        }
      }
    }

    throw new Error(
      `No positions data found in response. Response: ${JSON.stringify(response, null, 2)}`
    );
  }

  /**
   * Finds the reserve information for a given token symbol or name within the positions response.
   */
  private getReserveForToken(
    response: GetWalletLendingPositionsResponse,
    tokenNameOrSymbol: string
  ): UserReserve {
    for (const position of response.positions) {
      for (const reserve of position.userReserves) {
        const name = reserve.token!.name;
        const symbol = reserve.token!.symbol;

        if (name === tokenNameOrSymbol || symbol === tokenNameOrSymbol) {
          try {
            return UserReserveSchema.parse(reserve);
          } catch (error) {
            console.error('Failed to parse UserReserve:', error);
            console.error('Reserve object that failed parsing:', reserve);
            throw new Error(
              `Failed to parse reserve data for token ${tokenNameOrSymbol}. Ensure the SDK response matches UserReserveSchema. Reserve: ${JSON.stringify(reserve, null, 2)}`
            );
          }
        }
      }
    }

    throw new Error(
      `No reserve found for token ${tokenNameOrSymbol}. Response: ${JSON.stringify(response, null, 2)}`
    );
  }

  /**
   * Helper to get reserve for a token
   */
  async getTokenReserve(userAddress: string, tokenName: string): Promise<UserReserve> {
    const response = await this.processUserInput('show my positions', userAddress);
    const positionsData = this.extractPositionsData(response);
    return this.getReserveForToken(positionsData, tokenName);
  }

  /**
   * Populate token map from position data since capabilities return empty symbols
   */
  private populateTokenMapFromPositions(positionsData: GetWalletLendingPositionsResponse): void {
    const newTokensFound: string[] = [];

    positionsData.positions.forEach(position => {
      position.userReserves.forEach(reserve => {
        const token = reserve.token;
        if (
          token &&
          token.symbol &&
          token.symbol.trim() &&
          token.tokenUid?.chainId &&
          token.tokenUid?.address
        ) {
          const symbol = token.symbol.trim();
          const tokenInfo: TokenInfo = {
            chainId: token.tokenUid.chainId,
            address: token.tokenUid.address,
            decimals: token.decimals ?? 18,
          };

          if (!this.tokenMap[symbol]) {
            this.tokenMap[symbol] = [tokenInfo];
            this.availableTokens.push(symbol);
            newTokensFound.push(symbol);
          } else {
            const exists = this.tokenMap[symbol].some(
              t =>
                t.chainId === tokenInfo.chainId &&
                t.address.toLowerCase() === tokenInfo.address.toLowerCase()
            );
            if (!exists) {
              this.tokenMap[symbol].push(tokenInfo);
            }
          }
        }
      });
    });

    if (newTokensFound.length > 0) {
      console.error(
        `Populated token map from position data. Added tokens: ${newTokensFound.join(', ')}`
      );
      console.error(`Total available tokens: ${this.availableTokens.join(', ')}`);
    }
  }
}
