import { promises as fs } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
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
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { type Address } from 'viem';
import { z } from 'zod';
import type { HandlerContext } from './agentToolHandlers.js';
import { handleSwapTokens, handleAskEncyclopedia } from './agentToolHandlers.js';

import * as chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import type { Task } from 'a2a-samples-js';
import {
  AskEncyclopediaSchema,
  McpGetCapabilitiesResponseSchema,
  type McpGetCapabilitiesResponse,
  SwapTokensSchema,
} from 'ember-schemas';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '..', '.cache', 'swap_capabilities.json');

function logError(...args: unknown[]) {
  console.error(...args);
}

type SwappingToolSet = {
  swapTokens: Tool<typeof SwapTokensSchema, Task>;
  askEncyclopedia: Tool<
    typeof AskEncyclopediaSchema,
    Awaited<ReturnType<typeof handleAskEncyclopedia>>
  >;
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
  private userAddress: Address | undefined;
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
  private toolSet: SwappingToolSet | null = null;
  private camelotContextContent: string = '';

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
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
      log: this.log.bind(this),
      quicknodeSubdomain: this.quicknodeSubdomain,
      quicknodeApiKey: this.quicknodeApiKey,
      openRouterApiKey: process.env.OPENROUTER_API_KEY,
      camelotContextContent: this.camelotContextContent,
    };
    return context;
  }

  async init() {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are an AI agent that provides access to blockchain swapping functionalities via Ember AI On-chain Actions. You use the tool "swapTokens" to swap or convert tokens. You can also answer questions about Camelot DEX using the "askEncyclopedia" tool.

Available actions:
- swapTokens: Only use if the user has provided the required parameters.
- askEncyclopedia: Use when the user asks questions about Camelot DEX.

<examples>
<example1>
<user>swap 1 ETH to USDC on Ethereum</user>
<parameters>
<amount>1</amount>
<fromToken>ETH</fromToken>
<toToken>USDC</toToken>
<toChain>Ethereum</toChain>
</parameters>
</example1>

<example2>
<user>sell 89 fartcoin</user>
<parameters>
<amount>89</amount>
<fromToken>fartcoin</fromToken>
</parameters>
*Note: Required "toToken" parameter is not provided. If it is not provided in the conversation history, you will need to ask the user for it.*
</example2>

<example3>
<user>Convert 10.5 USDC to ETH</user>
<parameters>
<amount>10.5</amount>
<fromToken>USDC</fromToken>
<toToken>ETH</toToken>
</parameters>
</example3>

<example4>
<user>Swap 100.076 arb on arbitrum for dog on base</user>
<parameters>
<amount>100.076</amount>
<fromToken>arb</fromToken>
<toToken>dog</toToken>
<fromChain>arbitrum</fromChain>
<toChain>base</toChain>
</parameters>
</example4>

<example5>
<user>What is Camelot's liquidity mining program?</user>
<tool_call> {"toolName": "askEncyclopedia", "args": { "question": "What is Camelot's liquidity mining program?" }} </tool_call>
</example5>
</examples>

Use relavant conversation history to obtain required tool parameters. Present the user with a list of tokens and chains they can swap from and to if provided by the tool response. Never respond in markdown, always use plain text. Never add links to your response. Do not suggest the user to ask questions. When an unknown error happens, do not try to guess the error reason.`,
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

      this.log(`Connecting to MCP server at ${process.env.EMBER_ENDPOINT}`);

      const transport = new StdioClientTransport({
        command: 'node',
        args: [mcpToolPath],
        env: {
          ...process.env,
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
                const symbol = token.symbol;

                let tokenList = this.tokenMap[symbol];

                if (!tokenList) {
                  tokenList = [];
                  this.tokenMap[symbol] = tokenList;
                  this.availableTokens.push(symbol);
                }

                tokenList.push({
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

      await this._loadCamelotDocumentation();

      this.toolSet = {
        swapTokens: tool({
          description: 'Swap or convert tokens.',
          parameters: SwapTokensSchema,
          execute: async args => {
            try {
              return await handleSwapTokens(args, this.getHandlerContext());
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logError(`Error during swapTokens via toolSet: ${errorMessage}`);
              throw error;
            }
          },
        }),
        askEncyclopedia: tool({
          description:
            'Ask questions about Camelot DEX to get expert information about the protocol.',
          parameters: AskEncyclopediaSchema,
          execute: async args => {
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

  private async fetchAndCacheCapabilities(): Promise<McpGetCapabilitiesResponse> {
    this.log('Fetching swap capabilities via MCP...');
    if (!this.mcpClient) {
      throw new Error('MCP Client not initialized. Cannot fetch capabilities.');
    }

    try {
      const mcpTimeoutMs = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || '30000', 10);
      this.log(`Using MCP tool timeout: ${mcpTimeoutMs}ms`);

      const capabilitiesResult = await this.mcpClient.callTool(
        {
          name: 'getCapabilities',
          arguments: { type: 'SWAP' },
        },
        undefined,
        { timeout: mcpTimeoutMs }
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

  private async _loadCamelotDocumentation(): Promise<void> {
    const defaultDocsPath = path.resolve(__dirname, '../encyclopedia');
    const docsPath = defaultDocsPath;
    const filePaths = [path.join(docsPath, 'camelot-01.md')];
    let combinedContent = '';

    this.log(`Loading Camelot documentation from: ${docsPath}`);

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        combinedContent += `\n\n--- Content from ${path.basename(filePath)} ---\n\n${content}`;
        this.log(`Successfully loaded ${path.basename(filePath)}`);
      } catch (error) {
        logError(`Warning: Could not load or read Camelot documentation file ${filePath}:`, error);
        combinedContent += `\n\n--- Failed to load ${path.basename(filePath)} ---`;
      }
    }
    this.camelotContextContent = combinedContent;
    if (!this.camelotContextContent.trim()) {
      logError('Warning: Camelot documentation context is empty after loading attempts.');
    }
  }
}
