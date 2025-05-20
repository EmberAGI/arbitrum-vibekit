import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import {
  handleBorrow,
  handleRepay,
  handleSupply,
  handleWithdraw,
  handleGetUserPositions,
  handleAskEncyclopedia,
  type HandlerContext,
  type TokenInfo,
} from './agentToolHandlers.js';
import type { Task } from 'a2a-samples-js/schema';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'module';
import * as chains from 'viem/chains';
import type { Chain } from 'viem/chains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '.cache', 'lending_capabilities.json');

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const ZodTokenUidSchema = z.object({
  chainId: z.string().optional(),
  address: z.string().optional(),
});

const ZodTokenSchema = z
  .object({
    symbol: z.string().optional(),
    name: z.string().optional(),
    decimals: z.number().optional(),
    tokenUid: ZodTokenUidSchema.optional(),
  })
  .passthrough();

const ZodLendingCapabilitySchema = z
  .object({
    capabilityId: z.string().optional(),
    currentSupplyApy: z.string().optional(),
    currentBorrowApy: z.string().optional(),
    underlyingToken: ZodTokenSchema.optional(),
    maxLtv: z.string().optional(),
    liquidationThreshold: z.string().optional(),
  })
  .passthrough();

const ZodCapabilitySchema = z
  .object({
    lendingCapability: ZodLendingCapabilitySchema.optional(),
  })
  .passthrough();

const ZodGetCapabilitiesResponseSchema = z
  .object({
    capabilities: z.array(ZodCapabilitySchema),
  })
  .passthrough();

type McpGetCapabilitiesResponse = z.infer<typeof ZodGetCapabilitiesResponseSchema>;

const ZodMcpTextWrapperSchema = z.object({
  content: z
    .array(
      z.object({
        type: z.literal('text'),
        text: z.string(),
      })
    )
    .min(1),
});

const TokenInfoSchema = z.object({
  chainId: z.string(),
  address: z.string(),
  decimals: z.number(),
});

const BorrowRepaySupplyWithdrawSchema = z.object({
  tokenName: z
    .string()
    .describe(
      "The symbol of the token (e.g., 'USDC', 'WETH'). Must be one of the available tokens."
    ),
  amount: z
    .string()
    .describe('The amount of the token to use, as a string representation of a number.'),
});

const GetUserPositionsSchema = z.object({});

const AskEncyclopediaSchema = z.object({
  question: z.string().describe('The question to ask the Aave encyclopedia.'),
});

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
  private tokenMap: Record<string, Array<TokenInfo>> = {};
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;
  private availableTokens: string[] = [];
  private toolSet: LendingToolSet | null = null;
  public conversationHistory: CoreMessage[] = [];
  private userAddress?: string;
  private aaveContextContent: string = '';

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set!');
    }
  }

  async init(): Promise<void> {
    this.setupMCPClient();

    console.error('Initializing MCP client transport...');
    try {
      const require = createRequire(import.meta.url);
      const mcpToolPath = require.resolve('ember-mcp-tool-server');
      console.error(`Found MCP tool server path: ${mcpToolPath}`);

      console.error(`Connecting to MCP server at ${process.env.EMBER_ENDPOINT}`);
      const transport = new StdioClientTransport({
        command: 'node',
        args: [mcpToolPath],
        env: {
          ...process.env,
          EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? 'grpc.api.emberai.xyz:50051',
        },
      });

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
        description:
          'Borrow a token. Provide the token name (e.g., USDC, WETH) and a human-readable amount.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: borrow', args);
          try {
            return await handleBorrow(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during borrow via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
      repay: tool({
        description: 'Repay a borrowed token. Provide the token name and a human-readable amount.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: repay', args);
          try {
            return await handleRepay(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during repay via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
      supply: tool({
        description:
          'Supply (deposit) a token. Provide the token name and a human-readable amount.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: supply', args);
          try {
            return await handleSupply(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during supply via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
      withdraw: tool({
        description:
          'Withdraw a previously supplied token. Provide the token name and a human-readable amount.',
        parameters: BorrowRepaySupplyWithdrawSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: withdraw', args);
          try {
            return await handleWithdraw(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during withdraw via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
      getUserPositions: tool({
        description: 'Get a summary of your current lending and borrowing positions.',
        parameters: GetUserPositionsSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: getUserPositions', args);
          try {
            return await handleGetUserPositions(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during getUserPositions via toolSet: ${error.message}`);
            throw error;
          }
        },
      }),
      askEncyclopedia: tool({
        description:
          'Ask a question about Aave to retrieve specific information about the protocol using embedded documentation.',
        parameters: AskEncyclopediaSchema,
        execute: async args => {
          console.error('Vercel AI SDK calling handler: askEncyclopedia', args);
          try {
            return await handleAskEncyclopedia(args, this.getHandlerContext());
          } catch (error: any) {
            logError(`Error during askEncyclopedia via toolSet: ${error.message}`);
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

Only use tools if the user explicitly asks to perform an action and provides the necessary parameters.
- borrow, repay, supply, withdraw require: tokenName, amount.
- getUserPositions requires no parameters.
- askEncyclopedia requires a question about Aave.

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

  private async fetchAndCacheCapabilities(): Promise<McpGetCapabilitiesResponse> {
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

      const wrapperValidationResult = ZodMcpTextWrapperSchema.safeParse(capabilitiesResult);

      if (!wrapperValidationResult.success) {
        logError(
          'MCP getCapabilities tool returned an unexpected structure. Zod Error:',
          JSON.stringify(wrapperValidationResult.error.format(), null, 2)
        );
        logError('Data that failed wrapper validation:', capabilitiesResult);
        throw new Error(
          'MCP getCapabilities tool returned an unexpected structure. Expected { content: [{ type: "text", text: string }] }.'
        );
      }

      const jsonString = wrapperValidationResult.data.content[0]!.text;
      let parsedData: any;
      try {
        console.error('Attempting to parse JSON string from content[0].text...');
        parsedData = JSON.parse(jsonString);
      } catch (parseError) {
        logError('Failed to parse JSON string from content[0].text:', parseError);
        logError('Original text content:', jsonString);
        throw new Error(
          `Failed to parse nested JSON response from getCapabilities: ${(parseError as Error).message}`
        );
      }

      const dataString = JSON.stringify(parsedData, null, 2);
      const previewLength = 500;
      if (dataString.length < previewLength * 2) {
        console.error('Parsed data structure before final validation:', dataString);
      } else {
        console.error(
          'Parsed data structure before final validation (Head):\n',
          dataString.substring(0, previewLength) + '\n...'
        );
        console.error(
          'Parsed data structure before final validation (Tail):\n...',
          dataString.substring(dataString.length - previewLength)
        );
      }

      const capabilitiesValidationResult = ZodGetCapabilitiesResponseSchema.safeParse(parsedData);

      if (!capabilitiesValidationResult.success) {
        logError(
          'Parsed MCP getCapabilities response validation failed. Zod Error:',
          JSON.stringify(capabilitiesValidationResult.error.format(), null, 2)
        );
        throw new Error('Failed to validate the parsed capabilities data from MCP server tool.');
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
    } catch (error) {
      logError('Error calling getCapabilities tool or processing response:', error);
      throw new Error(
        `Failed to fetch/validate capabilities via MCP tool: ${(error as Error).message}`
      );
    }
  }

  private async setupTokenMap(): Promise<void> {
    let capabilitiesResponse: McpGetCapabilitiesResponse | undefined;
    const useCache = process.env.AGENT_CACHE_TOKENS === 'true';

    if (useCache) {
      try {
        await fs.access(CACHE_FILE_PATH);
        console.error('Loading lending capabilities from cache...');
        const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
        const parsedJson = JSON.parse(cachedData);
        const validationResult = ZodGetCapabilitiesResponseSchema.safeParse(parsedJson);
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

    this.tokenMap = {};
    this.availableTokens = [];
    let loadedTokenCount = 0;
    let processedCapabilityCount = 0;

    if (capabilitiesResponse?.capabilities) {
      console.error(
        `Processing ${capabilitiesResponse.capabilities.length} capabilities entries...`
      );
      capabilitiesResponse.capabilities.forEach((capabilityEntry, index) => {
        if (capabilityEntry.lendingCapability) {
          processedCapabilityCount++;
          const lendingCap = capabilityEntry.lendingCapability;
          const token = lendingCap.underlyingToken;

          if (token && token.symbol && token.tokenUid?.chainId && token.tokenUid?.address) {
            const symbol = token.symbol;
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
      console.warn('Warning: Token map is empty after processing capabilities.');
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
      const { response, text, finishReason } = await generateText({
        model: openrouter('google/gemini-2.5-flash-preview'),
        messages: this.conversationHistory,
        tools: this.toolSet,
        maxSteps: 5,
        onStepFinish: async (stepResult: StepResult<typeof this.toolSet>) => {
          console.error(`Step finished. Reason: ${stepResult.finishReason}`);
        },
      });
      console.error(`generateText finished. Reason: ${finishReason}`);
      console.error(`LLM response text: ${text}`);

      response.messages.forEach((msg, index) => {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          msg.content.forEach(part => {
            if (part.type === 'tool-call') {
              console.error(
                `[LLM Request ${index}]: Tool Call - ${part.toolName} with args ${JSON.stringify(part.args)}`
              );
            }
          });
        } else if (msg.role === 'tool') {
          if (Array.isArray(msg.content)) {
            msg.content.forEach((toolResult: ToolResultPart) => {
              console.error(`[Tool Result ${index} for ${toolResult.toolName} received]`);
            });
          }
        } else if (msg.role === 'assistant') {
          console.error(`[LLM Response ${index}]: ${msg.content}`);
        }
      });

      this.conversationHistory.push(...response.messages);

      let finalTask: Task | null = null;
      for (const message of response.messages) {
        if (message.role === 'tool' && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (
              part.type === 'tool-result' &&
              part.result &&
              typeof part.result === 'object' &&
              'id' in part.result
            ) {
              console.error(`Processing tool result for ${part.toolName} from response.messages`);
              finalTask = part.result as Task;
              console.error(`Task Result State: ${finalTask?.status?.state ?? 'N/A'}`);
              const firstPart = finalTask?.status?.message?.parts[0];
              const messageText = firstPart && firstPart.type === 'text' ? firstPart.text : 'N/A';
              console.error(`Task Result Message: ${messageText}`);
              break;
            }
          }
        }
        if (finalTask) break;
      }

      if (finalTask) {
        if (['completed', 'failed', 'canceled'].includes(finalTask.status.state)) {
          console.error(
            `Task finished with state ${finalTask.status.state}. Clearing conversation history.`
          );
          this.conversationHistory = [];
        }
        return finalTask;
      }

      console.error('No tool called or task found, returning text response.');
      return {
        id: this.userAddress!,
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
        id: this.userAddress!,
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

  private getHandlerContext(): HandlerContext {
    return {
      mcpClient: this.mcpClient!,
      tokenMap: this.tokenMap,
      userAddress: this.userAddress,
      log: console.error,
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
      openRouterApiKey: process.env.OPENROUTER_API_KEY!,
      aaveContextContent: this.aaveContextContent,
    };
  }

  private formatNumeric(
    value: string | number | undefined,
    minDecimals = 2,
    maxDecimals = 2
  ): string {
    if (value === undefined) return 'N/A';
    try {
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(num)) return 'N/A';

      if (Math.abs(num) < 1e-6 && num !== 0) {
        return num.toExponential(maxDecimals);
      }

      return num.toLocaleString(undefined, {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
      });
    } catch (e) {
      console.error(`Error formatting numeric value: ${value}`, e);
      return 'N/A';
    }
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
}
