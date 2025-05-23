import { z } from 'zod';
import { type Address } from 'viem';
import type { HandlerContext } from './agentToolHandlers.js';
import { handleSwapTokens, handleAskEncyclopedia } from './agentToolHandlers.js';
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit';
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
import * as chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import type { Task } from 'a2a-samples-js/schema';
import { createRequire } from 'module';

// Instantiate OpenRouter provider
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE_PATH = path.join(__dirname, '.cache', 'swap_capabilities.json');

const SwapTokensSchema = z.object({
  fromToken: z
    .string()
    .describe(
      'The symbol of the token to swap from (source token). It may be lowercase or uppercase.'
    ),
  toToken: z
    .string()
    .describe(
      'The symbol of the token to swap to (destination token). It may be lowercase or uppercase.'
    ),
  amount: z
    .string()
    .describe(
      'The amount of the token to swap from. It will be in a human readable format, e.g. The amount \"1.02 ETH\" will be 1.02.'
    ),
  fromChain: z.string().optional().describe('Optional chain name for the source token.'),
  toChain: z.string().optional().describe('Optional chain name for the destination token.'),
});
type SwapTokensArgs = z.infer<typeof SwapTokensSchema>;

const AskEncyclopediaSchema = z.object({
  question: z.string().describe('The question to ask the Camelot DEX expert.'),
});

const McpCapabilityTokenSchema = z
  .object({
    symbol: z.string().optional(),
    name: z.string().optional(),
    decimals: z.number().optional(),
    tokenUid: z
      .object({
        chainId: z.string().optional(),
        address: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const McpCapabilitySchema = z
  .object({
    protocol: z.string().optional(),
    capabilityId: z.string().optional(),
    supportedTokens: z.array(McpCapabilityTokenSchema).optional(),
  })
  .passthrough();

const McpSingleCapabilityEntrySchema = z
  .object({
    swapCapability: McpCapabilitySchema.optional(),
  })
  .passthrough();

const McpGetCapabilitiesResponseSchema = z.object({
  capabilities: z.array(McpSingleCapabilityEntrySchema),
});

type McpGetCapabilitiesResponse = z.infer<typeof McpGetCapabilitiesResponseSchema>;

// Zod schemas for Allora MCP responses
const ListAllTopicsResponseSchema = z.array(z.any()).describe('Array of Allora topics');
const InferenceResponseSchema = z.any().describe('Allora inference data');

// FIRST_EDIT: Add tool parameter schemas for listing and fetching Allora topics
const ListAllTopicsToolSchema = z.object({}).describe('No parameters to list Allora topics');
const GetInferenceToolSchema = z.object({
  topicID: z.number().describe('ID of the topic to fetch inference for'),
});

// Zod schemas for decision logic
const PredictedPriceSchema = z
  .object({ predictedPrice: z.number(), currentPrice: z.number() })
  .passthrough();
const ProbabilitySchema = z.object({ probUp: z.number(), probDown: z.number() }).passthrough();

// Schema for prediction-based trading tool
const PredictAndSwapSchema = z.object({
  tokenSymbol: z.string().describe('Symbol of the token to trade, e.g. ETH'),
  amount: z.string().describe('Amount of the token to trade'),
  horizon: z.string().optional().describe('Prediction horizon text to match topic, e.g. "8 hours"'),
  buyThreshold: z.number().optional().describe('Threshold strength to trigger buy action'),
  sellThreshold: z.number().optional().describe('Threshold strength to trigger sell action'),
  fromToken: z.string().optional().describe('Symbol of token to sell when action is sell'),
  toToken: z.string().optional().describe('Symbol of token to buy when action is buy'),
  fromChain: z.string().optional().describe('Source chain for the swap'),
  toChain: z.string().optional().describe('Destination chain for the swap'),
});

function logError(...args: unknown[]) {
  console.error(...args);
}

type SwappingToolSet = {
  list_all_topics: Tool<typeof ListAllTopicsToolSchema, Task>;
  get_inference_by_topic_id: Tool<typeof GetInferenceToolSchema, Task>;
  swapTokens: Tool<typeof SwapTokensSchema, Task>;
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
  private alloraMcpClient: Client | null = null;
  private toolSet: SwappingToolSet | null = null;
  private camelotContextContent: string = '';

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set!');
    }
    if (!process.env.ALLORA_API_KEY) {
      this.log(
        'Warning: ALLORA_API_KEY not set in environment. Allora predictions will not be available.'
      );
    }

    this.alloraMcpClient = new Client(
      { name: 'AlloraSwappingAgent-AlloraClient', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
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
        content: `You are an AI agent that leverages Allora price predictions to help users make informed trading decisions. First, call the "list_all_topics" tool to retrieve all available signal topics. From the returned list, identify the single topic whose metadata (token symbol and optional horizon) matches the user's request. Then call the "get_inference_by_topic_id" tool once with that topicID to fetch its raw prediction JSON. If that inference indicates a buy or sell, invoke the "swapTokens" tool with the correct parameters (tokenSymbol, amount, fromToken, toToken, fromChain, toChain). If the inference indicates a hold (no buy or sell), respond with a clear explanation of why no action was taken. Ask the user any missing information needed for swapping. Always respond in plain text.`,
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

      if (this.alloraMcpClient && process.env.ALLORA_API_KEY) {
        this.log('Initializing Allora MCP client via STDIO...');
        try {
          const require = createRequire(import.meta.url);
          const alloraServerScriptPath = require.resolve('@alloralabs/mcp-server/dist/index.js');
          this.log(`Found Allora MCP server script at: ${alloraServerScriptPath}`);

          const alloraTransport = new StdioClientTransport({
            command: 'node',
            args: [alloraServerScriptPath],
            env: {
              ...process.env,
              ALLORA_API_KEY: process.env.ALLORA_API_KEY,
              // Use port 0 (ephemeral port) so the OS assigns an available port and avoids conflicts
              PORT: '0',
            },
          });

          await this.alloraMcpClient.connect(alloraTransport);
          this.log(
            'Allora MCP client connected successfully via STDIO. Tools from this server should now be available.'
          );
        } catch (alloraError) {
          logError('Failed to initialize or connect Allora MCP client:', alloraError);
          this.alloraMcpClient = null;
          this.log('Allora predictions will be unavailable due to connection error.');
        }
      } else if (!process.env.ALLORA_API_KEY) {
        this.log('ALLORA_API_KEY not set. Skipping Allora MCP client initialization.');
        this.alloraMcpClient = null;
      }

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
        try {
          swapCapabilities = await this.fetchAndCacheCapabilities();
        } catch (capErr) {
          logError(
            'Could not fetch swap capabilities, proceeding with empty capabilities:',
            capErr
          );
          // Fallback to empty list of capabilities so agent can still start
          swapCapabilities = { capabilities: [] };
        }
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
        list_all_topics: tool<typeof ListAllTopicsToolSchema, Task>({
          description: 'List all Allora signal topics.',
          parameters: ListAllTopicsToolSchema,
          execute: async () => {
            this.log('Tool list_all_topics invoked');
            try {
              const topics = await this.fetchAlloraTopics();
              return {
                id: this.userAddress || 'unknown-user',
                status: {
                  state: 'completed',
                  message: {
                    role: 'agent',
                    parts: [{ type: 'text', text: JSON.stringify(topics) }],
                  },
                },
              };
            } catch (error: any) {
              return {
                id: this.userAddress || 'unknown-user',
                status: {
                  state: 'failed',
                  message: {
                    role: 'agent',
                    parts: [{ type: 'text', text: `Error listing topics: ${error.message}` }],
                  },
                },
              };
            }
          },
        }),
        get_inference_by_topic_id: tool<typeof GetInferenceToolSchema, Task>({
          description: 'Fetch the Allora inference for a given topic ID.',
          parameters: GetInferenceToolSchema,
          execute: async args => {
            this.log('Tool get_inference_by_topic_id invoked with args:', args);
            try {
              const inference = await this.fetchAlloraInference(args.topicID);
              return {
                id: this.userAddress || 'unknown-user',
                status: {
                  state: 'completed',
                  message: {
                    role: 'agent',
                    parts: [{ type: 'text', text: JSON.stringify(inference) }],
                  },
                },
              };
            } catch (error: any) {
              return {
                id: this.userAddress || 'unknown-user',
                status: {
                  state: 'failed',
                  message: {
                    role: 'agent',
                    parts: [
                      {
                        type: 'text',
                        text: `Error fetching inference for topicID ${args.topicID}: ${error.message}`,
                      },
                    ],
                  },
                },
              };
            }
          },
        }),
        swapTokens: tool<typeof SwapTokensSchema, Task>({
          description: 'Swap or convert tokens. Use after prediction suggests buy or sell.',
          parameters: SwapTokensSchema,
          execute: async args => {
            this.log('Tool swapTokens invoked with args:', args);
            try {
              return await handleSwapTokens(args, this.getHandlerContext());
            } catch (error: any) {
              logError(`Error during swapTokens via toolSet: ${error.message}`);
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
    if (this.alloraMcpClient) {
      this.log('Closing Allora MCP client...');
      try {
        await this.alloraMcpClient.close();
        this.log('Allora MCP client closed.');
      } catch (error) {
        logError('Error closing Allora MCP client:', error);
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
        maxTokens: 16384,
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

      const capabilities = parseMcpToolResponsePayload(
        capabilitiesResult,
        McpGetCapabilitiesResponseSchema
      );

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

  // Fetch all available topics from Allora MCP server
  public async fetchAlloraTopics(): Promise<unknown[]> {
    if (!this.alloraMcpClient) {
      throw new Error('Allora MCP client not initialized.');
    }
    this.log('Fetching Allora topics via MCP...');
    const rawResult = await this.alloraMcpClient.callTool({
      name: 'list_all_topics',
      arguments: {},
    });
    const topics = parseMcpToolResponsePayload(rawResult, ListAllTopicsResponseSchema);
    this.log(`Fetched ${topics.length} topics from Allora.`);
    return topics;
  }

  // Fetch inference for a specific topic ID from Allora MCP server
  public async fetchAlloraInference(topicID: number): Promise<unknown> {
    if (!this.alloraMcpClient) {
      throw new Error('Allora MCP client not initialized.');
    }
    this.log(`Fetching inference for Allora topic ID ${topicID} via MCP...`);
    const rawResult = await this.alloraMcpClient.callTool({
      name: 'get_inference_by_topic_id',
      arguments: { topicID },
    });
    const inference = parseMcpToolResponsePayload(rawResult, InferenceResponseSchema);
    this.log(`Fetched inference for topic ID ${topicID}.`);
    return inference;
  }

  // Example helper to get prediction by matching topic name
  public async getPredictionForToken(
    tokenSymbol: string,
    horizon?: string
  ): Promise<unknown | null> {
    const topics: unknown[] = await this.fetchAlloraTopics();
    // Basic matching: look for topics whose JSON string contains tokenSymbol and horizon
    const match = topics.find(t => {
      const json = JSON.stringify(t).toLowerCase();
      return (
        json.includes(tokenSymbol.toLowerCase()) &&
        (horizon ? json.includes(horizon.toLowerCase()) : true)
      );
    }) as { topicID: number } | undefined;
    if (!match || typeof match.topicID !== 'number') {
      this.log(
        `No Allora topic found for token ${tokenSymbol}${horizon ? ' and horizon ' + horizon : ''}.`
      );
      return null;
    }
    const inference = await this.fetchAlloraInference(match.topicID);
    return inference;
  }

  async fetchTopics(): Promise<unknown[]> {
    if (!this.alloraMcpClient) throw new Error('Allora client not initialized.');
    const raw = await this.alloraMcpClient.callTool({ name: 'list_all_topics', arguments: {} });
    const topics = parseMcpToolResponsePayload(raw, ListAllTopicsResponseSchema);
    return topics;
  }

  async fetchInference(topicID: number): Promise<unknown> {
    if (!this.alloraMcpClient) throw new Error('Allora client not initialized.');
    const raw = await this.alloraMcpClient.callTool({
      name: 'get_inference_by_topic_id',
      arguments: { topicID },
    });
    const inference = parseMcpToolResponsePayload(raw, InferenceResponseSchema);
    return inference;
  }

  /**
   * Decide a trading action based on inference data.
   * Supports price-based inference (predictedPrice vs. currentPrice) and probability-based (probUp vs. probDown).
   * @param inference Raw inference object returned by Allora MCP server.
   * @param buyThreshold Minimum strength to trigger a buy (e.g., 0.01 = +1%).
   * @param sellThreshold Minimum strength to trigger a sell (e.g., 0.01 = -1%).
   * @returns An object with action 'buy' | 'sell' | 'hold' and the computed strength.
   */
  public decideAction(
    inference: unknown,
    buyThreshold = 0.01,
    sellThreshold = 0.01
  ): { action: 'buy' | 'sell' | 'hold'; strength: number } {
    // Try price-based schema
    const priceParse = PredictedPriceSchema.safeParse(inference);
    if (priceParse.success) {
      const { predictedPrice, currentPrice } = priceParse.data;
      const strength = (predictedPrice - currentPrice) / currentPrice;
      let action: 'buy' | 'sell' | 'hold' = 'hold';
      if (strength >= buyThreshold) action = 'buy';
      else if (strength <= -sellThreshold) action = 'sell';
      return { action, strength };
    }
    // Try probability-based schema
    const probParse = ProbabilitySchema.safeParse(inference);
    if (probParse.success) {
      const { probUp, probDown } = probParse.data;
      const strength = probUp - probDown;
      let action: 'buy' | 'sell' | 'hold' = 'hold';
      if (strength >= buyThreshold) action = 'buy';
      else if (strength <= -sellThreshold) action = 'sell';
      return { action, strength };
    }
    throw new Error('Inference does not match expected price-based or probability-based formats.');
  }
}
