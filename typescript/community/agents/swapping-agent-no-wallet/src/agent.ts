import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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
  type LanguageModelV1,
} from 'ai';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import { type Address } from 'viem';
import { z } from 'zod';
import type { HandlerContext } from './agentToolHandlers.js';
import { handleSwapTokens, handleAskEncyclopedia } from './agentToolHandlers.js';

import * as chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { GetTokensResponseSchema, type Token } from 'ember-api';

const providerSelector = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

const availableProviders = getAvailableProviders(providerSelector);

if (availableProviders.length === 0) {
  throw new Error(
    'No AI providers configured. Please set at least one provider API key (OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or HYPERBOLIC_API_KEY).'
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
  `Swapping Agent using provider: ${preferredProvider}` +
    (modelOverride ? ` (model: ${modelOverride})` : '')
);

const CHAIN_MAPPINGS = [
  { id: '1', names: ['ethereum', 'mainnet', 'eth'] },
  { id: '42161', names: ['arbitrum', 'arbitrum one', 'arb'] },
  { id: '10', names: ['optimism', 'op'] },
  { id: '137', names: ['polygon', 'matic'] },
  { id: '8453', names: ['base'] },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function logError(...args: unknown[]) {
  console.error(...args);
}

// Local tool schemas
const SwapTokensSchema = z.object({
  amount: z.string().describe('The amount of the token to swap'),
  fromToken: z.string().describe('The token symbol to swap from'),
  toToken: z.string().describe('The token symbol to swap to'),
  fromChain: z.string().optional().describe('The chain to swap from'),
  toChain: z.string().optional().describe('The chain to swap to'),
});

const AskEncyclopediaSchema = z.object({
  question: z.string().describe('Question about Camelot DEX'),
});

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
  private tokenMap: Record<string, Array<Token>> = {};
  private availableTokens: string[] = [];
  private conversationMap: Record<string, CoreMessage[]> = {};
  private mcpClient: Client | null = null;
  private toolSet: SwappingToolSet | null = null;
  private camelotContextContent: string = '';
  private provider: (model?: string) => LanguageModelV1;

  constructor(quicknodeSubdomain: string, quicknodeApiKey: string) {
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;
    this.provider = selectedProvider!;

    // provider availability validated at module load time.
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
      provider: this.provider,
    };
    return context;
  }

  /**
   * Populate the internal tokenMap with generic tokens returned by the onchain-actions getTokens tool.
   * Duplicates (based on symbol + chainId) are ignored.
   */
  private populateGenericTokens(tokens: Token[]) {
    if (!tokens || tokens.length === 0) {
      this.log('No generic tokens provided to populateGenericTokens');
      return;
    }

    let addedCount = 0;

    tokens.forEach(token => {
      const symbol = token.symbol;

      if (!this.tokenMap[symbol]) {
        this.tokenMap[symbol] = [];
        this.availableTokens.push(symbol);
      }

      const existsOnChain = this.tokenMap[symbol]!.some(
        t => t.tokenUid.chainId === token.tokenUid.chainId
      );

      if (!existsOnChain) {
        this.tokenMap[symbol]!.push(token);
        addedCount++;
      }
    });

    this.log(
      `Added ${addedCount} generic tokens to the token map. Total tokens: ${this.availableTokens.length}`
    );

    // Debug: Log first 20 available tokens to help with debugging
    this.log('First 20 available tokens:', this.availableTokens.slice(0, 20).join(', '));
  }

  async init() {
    this.log('Initializing MCP client via HTTP...');
    try {
      this.mcpClient = new Client(
        { name: 'SwappingAgent', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      const emberEndpoint = process.env.EMBER_ENDPOINT;
      if (!emberEndpoint) {
        throw new Error('EMBER_ENDPOINT environment variable not set');
      }

      this.log(`Connecting to MCP server at ${emberEndpoint}`);

      const transport = new StreamableHTTPClientTransport(new URL(emberEndpoint));

      await this.mcpClient.connect(transport);
      this.log('MCP client connected successfully.');

      // Fetch supported tokens via MCP getTokens
      try {
        this.log('Fetching supported tokens via MCP getTokens...');

        const chainIds = CHAIN_MAPPINGS.map(mapping => mapping.id);
        const getTokensArgs = chainIds.length > 0 ? { chainIds } : {};

        const tokensResult = await this.mcpClient.callTool({
          name: 'getTokens',
          arguments: getTokensArgs,
        });

        const tokensResponse = parseMcpToolResponsePayload(tokensResult, GetTokensResponseSchema);
        this.populateGenericTokens(tokensResponse.tokens);
      } catch (err) {
        this.log('Failed to fetch generic tokens via getTokens:', err);
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

    // Initialize conversation history for this user if not exists
    if (!this.conversationMap[userAddress]) {
      this.conversationMap[userAddress] = [
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
    }

    const conversationHistory = this.conversationMap[userAddress];
    const userMessage: CoreUserMessage = { role: 'user', content: userInput };
    conversationHistory.push(userMessage);

    try {
      this.log('Calling generateText with Vercel AI SDK...');
      const { response, text, finishReason } = await generateText({
        model: modelOverride ? this.provider(modelOverride) : this.provider(),
        messages: conversationHistory,
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

      conversationHistory.push(...response.messages);

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
            const messageText = firstPart && firstPart.kind === 'text' ? firstPart.text : 'N/A';
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
            this.conversationMap[userAddress] = [];
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
              contextId: `unknown-${Date.now()}`,
              kind: 'task',
              status: {
                state: TaskState.Failed,
                message: {
                  role: 'agent',
                  messageId: `msg-${Date.now()}`,
                  kind: 'message',
                  parts: [
                    {
                      kind: 'text',
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
          id: this.userAddress || 'unknown-user',
          contextId: `text-response-${Date.now()}`,
          kind: 'task',
          status: {
            state: TaskState.Completed,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [{ kind: 'text', text: text }],
            },
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
      conversationHistory.push(errorAssistantMessage);
      throw error;
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
