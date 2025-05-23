import { z } from 'zod';
import {
  parseUnits,
  createPublicClient,
  http,
  type Address,
  encodeFunctionData,
  type PublicClient,
  formatUnits,
} from 'viem';
import { getChainConfigById } from './agent.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Task, DataPart } from 'a2a-samples-js/schema';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
// Load ERC20 ABI JSON dynamically to avoid import assertion issues
const require = createRequire(import.meta.url as string);
const Erc20Json = JSON.parse(
  readFileSync(require.resolve('@openzeppelin/contracts/build/contracts/ERC20.json'), 'utf-8')
);
const Erc20Abi = Erc20Json.abi;
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import {
  createTransactionArtifactSchema,
  type TransactionArtifact,
  parseMcpToolResponsePayload,
} from 'arbitrum-vibekit';
import {
  validateTransactionPlans,
  TransactionPlanSchema,
  type TransactionPlan,
} from 'ember-mcp-tool-server';

// Allora schemas
const AlloraTopicSchema = z.object({
  topic_id: z.number(),
  topic_name: z.string(),
  description: z.string().nullable(),
  epoch_length: z.number(),
  ground_truth_lag: z.number(),
  loss_method: z.string(),
  worker_submission_window: z.number(),
  worker_count: z.number(),
  reputer_count: z.number(),
  total_staked_allo: z.number(),
  total_emissions_allo: z.number(),
  is_active: z.boolean(),
  is_endorsed: z.boolean(),
  forge_competition_id: z.number().nullable(),
  forge_competition_start_date: z.string().nullable(),
  forge_competition_end_date: z.string().nullable(),
  updated_at: z.string(),
});

export const ListAllTopicsResponseSchema = z.array(AlloraTopicSchema);
export type AlloraTopic = z.infer<typeof AlloraTopicSchema>;
export type ListAllTopicsResponse = z.infer<typeof ListAllTopicsResponseSchema>;

export const InferenceResponseSchema = z
  .object({
    signature: z.string(),
    token_decimals: z.number(),
    inference_data: z.object({
      network_inference: z.string(),
      network_inference_normalized: z.string(),
      confidence_interval_percentiles: z.array(z.number()),
      confidence_interval_percentiles_normalized: z.array(z.number()),
      confidence_interval_values: z.array(z.number()),
      confidence_interval_values_normalized: z.array(z.number()),
      topic_id: z.string(),
      timestamp: z.number(),
      extra_data: z.string(),
    }),
  })
  .passthrough(); // Allow additional fields that might be in the response

export type InferenceResponse = z.infer<typeof InferenceResponseSchema>;

// Standardized timeframe schema
const TimeframeSchema = z.object({
  value: z.number().positive(),
  unit: z.enum(['minute', 'hour', 'day']),
});

// Schema for first LLM call - Topic Discovery
const TopicFinderSchema = z.object({
  relatedTopicIds: z.array(z.string()),
  reasoning: z.string(),
});

// Schema for second LLM call - Best Prediction Selection
const PredictionSelectorSchema = z.object({
  shortTermPrediction: z
    .object({
      topicId: z.string(),
      timeframe: TimeframeSchema,
      predictionValue: z.number(),
      confidence: z.enum(['high', 'medium', 'low']),
    })
    .nullable(),
  longTermPrediction: z
    .object({
      topicId: z.string(),
      timeframe: TimeframeSchema,
      predictionValue: z.number(),
      confidence: z.enum(['high', 'medium', 'low']),
    })
    .nullable(),
  reasoning: z.string(),
});

export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

export const SwapPreviewSchema = z
  .object({
    fromTokenSymbol: z.string(),
    fromTokenAddress: z.string(),
    fromTokenAmount: z.string(),
    fromChain: z.string(),
    toTokenSymbol: z.string(),
    toTokenAddress: z.string(),
    toTokenAmount: z.string(),
    toChain: z.string(),
    exchangeRate: z.string(),
    executionTime: z.string(),
    expiration: z.string(),
    explorerUrl: z.string(),
  })
  .passthrough();

export type SwapPreview = z.infer<typeof SwapPreviewSchema>;

const SwapTransactionArtifactSchema = createTransactionArtifactSchema(SwapPreviewSchema);
export type SwapTransactionArtifact = TransactionArtifact<SwapPreview>;

const TokenDetailSchema = z.object({
  address: z.string(),
  chainId: z.string(),
});

const EstimationSchema = z.object({
  effectivePrice: z.string(),
  timeEstimate: z.string(),
  expiration: z.string(),
  baseTokenDelta: z.string(),
  quoteTokenDelta: z.string(),
});

const ProviderTrackingSchema = z.object({
  requestId: z.string().optional(),
  providerName: z.string().optional(),
  explorerUrl: z.string(),
});

export const SwapResponseSchema = z.object({
  baseToken: TokenDetailSchema,
  quoteToken: TokenDetailSchema,
  estimation: EstimationSchema,
  providerTracking: ProviderTrackingSchema,
  transactions: z.array(TransactionPlanSchema),
});

export type SwapResponse = z.infer<typeof SwapResponseSchema>;

export interface HandlerContext {
  emberMcpClient: Client;
  alloraMcpClient: Client | null;
  tokenMap: Record<string, TokenInfo[]>;
  userAddress: string | undefined;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
  openRouterApiKey?: string;
  camelotContextContent?: string;
}

function findTokensCaseInsensitive(
  tokenMap: Record<string, TokenInfo[]>,
  tokenName: string
): TokenInfo[] | undefined {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      return tokenMap[key];
    }
  }
  return undefined;
}

const chainMappings = [
  { id: '1', name: 'Ethereum', aliases: ['mainnet'] },
  { id: '42161', name: 'Arbitrum', aliases: [] },
  { id: '10', name: 'Optimism', aliases: [] },
  { id: '137', name: 'Polygon', aliases: ['matic'] },
  { id: '8453', name: 'Base', aliases: [] },
];

function mapChainNameToId(chainName: string): string | undefined {
  const normalized = chainName.toLowerCase();
  const found = chainMappings.find(
    mapping => mapping.name.toLowerCase() === normalized || mapping.aliases.includes(normalized)
  );
  return found?.id;
}

function mapChainIdToName(chainId: string): string {
  const found = chainMappings.find(mapping => mapping.id === chainId);
  return found?.name || chainId;
}

function findTokenDetail(
  tokenName: string,
  optionalChainName: string | undefined,
  tokenMap: Record<string, TokenInfo[]>,
  direction: 'from' | 'to'
): TokenInfo | string {
  const tokens = findTokensCaseInsensitive(tokenMap, tokenName);
  if (tokens === undefined) {
    throw new Error(`Token ${tokenName} not supported.`);
  }

  let tokenDetail: TokenInfo | undefined;

  if (optionalChainName) {
    const chainId = mapChainNameToId(optionalChainName);
    if (!chainId) {
      throw new Error(`Chain name ${optionalChainName} is not recognized.`);
    }
    tokenDetail = tokens?.find(token => token.chainId === chainId);
    if (!tokenDetail) {
      throw new Error(
        `Token ${tokenName} not supported on chain ${optionalChainName}. Available chains: ${tokens?.map(t => mapChainIdToName(t.chainId)).join(', ')}`
      );
    }
  } else {
    if (!tokens || tokens.length === 0) {
      throw new Error(`Token ${tokenName} not supported.`);
    }
    if (tokens.length > 1) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.chainId)}`)
        .join('\n');
      return `Multiple chains supported for ${tokenName}:\n${chainList}\nPlease specify the '${direction}Chain'.`;
    }
    tokenDetail = tokens[0];
  }

  if (!tokenDetail) {
    throw new Error(
      `Could not resolve token details for ${tokenName}${optionalChainName ? ' on chain ' + optionalChainName : ''}.`
    );
  }

  return tokenDetail;
}

export async function handleSwapTokens(
  params: {
    fromToken: string;
    toToken: string;
    amount: string;
    fromChain?: string;
    toChain?: string;
  },
  context: HandlerContext
): Promise<Task> {
  const { fromToken: rawFromToken, toToken: rawToToken, amount, fromChain, toChain } = params;
  const fromToken = rawFromToken.toUpperCase();
  const toToken = rawToToken.toUpperCase();

  if (!context.userAddress) {
    throw new Error('User address not set!');
  }

  const fromTokenResult = findTokenDetail(rawFromToken, fromChain, context.tokenMap, 'from');
  if (typeof fromTokenResult === 'string') {
    return {
      id: context.userAddress,
      status: {
        state: 'input-required',
        message: { role: 'agent', parts: [{ type: 'text', text: fromTokenResult }] },
      },
    };
  }
  const fromTokenDetail = fromTokenResult;

  const toTokenResult = findTokenDetail(rawToToken, toChain, context.tokenMap, 'to');
  if (typeof toTokenResult === 'string') {
    return {
      id: context.userAddress,
      status: {
        state: 'input-required',
        message: { role: 'agent', parts: [{ type: 'text', text: toTokenResult }] },
      },
    };
  }
  const toTokenDetail = toTokenResult;

  const atomicAmount = parseUnits(amount, fromTokenDetail.decimals);
  const txChainId = fromTokenDetail.chainId;
  const fromTokenAddress = fromTokenDetail.address as Address;
  const userAddress = context.userAddress as Address;

  context.log(
    `Preparing swap: ${rawFromToken} (${fromTokenAddress} on chain ${txChainId}) to ${rawToToken} (${toTokenDetail.address} on chain ${toTokenDetail.chainId}), Amount: ${amount} (${atomicAmount}), User: ${userAddress}`
  );

  let publicClient: PublicClient;
  try {
    const chainConfig = getChainConfigById(txChainId);
    const networkSegment = chainConfig.quicknodeSegment;
    const targetChain = chainConfig.viemChain;
    let dynamicRpcUrl: string;
    if (networkSegment === '') {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.quiknode.pro/${context.quicknodeApiKey}`;
    } else {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${context.quicknodeApiKey}`;
    }
    publicClient = createPublicClient({
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });
    context.log(`Public client created for chain ${txChainId} via ${dynamicRpcUrl.split('/')[2]}`);
  } catch (chainError) {
    context.log(`Failed to create public client for chain ${txChainId}:`, chainError);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Network configuration error for chain ${txChainId}.` }],
        },
      },
    };
  }

  let currentBalance: bigint;
  try {
    currentBalance = (await publicClient.readContract({
      address: fromTokenAddress,
      abi: Erc20Abi,
      functionName: 'balanceOf',
      args: [userAddress],
    })) as bigint;
    context.log(`User balance check: Has ${currentBalance}, needs ${atomicAmount} of ${fromToken}`);

    if (currentBalance < atomicAmount) {
      const formattedBalance = formatUnits(currentBalance, fromTokenDetail.decimals);
      context.log(`Insufficient balance for the swap. Needs ${amount}, has ${formattedBalance}`);
      return {
        id: userAddress,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Insufficient ${fromToken} balance. You need ${amount} but only have ${formattedBalance}.`,
              },
            ],
          },
        },
      };
    }
    context.log(`Sufficient balance confirmed.`);
  } catch (readError) {
    context.log(`Warning: Failed to read token balance. Error: ${(readError as Error).message}`);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Could not verify your ${fromToken} balance due to a network error. Please try again.`,
            },
          ],
        },
      },
    };
  }

  context.log(
    `Executing swap via MCP: ${fromToken} (address: ${fromTokenDetail.address}, chain: ${fromTokenDetail.chainId}) to ${toToken} (address: ${toTokenDetail.address}, chain: ${toTokenDetail.chainId}), amount: ${amount}, atomicAmount: ${atomicAmount}, userAddress: ${context.userAddress}`
  );

  const swapResponseRaw = await context.emberMcpClient.callTool({
    name: 'swapTokens',
    arguments: {
      fromTokenAddress: fromTokenDetail.address,
      fromTokenChainId: fromTokenDetail.chainId,
      toTokenAddress: toTokenDetail.address,
      toTokenChainId: toTokenDetail.chainId,
      amount: atomicAmount.toString(),
      userAddress: context.userAddress,
    },
  });

  let validatedSwapResponse: SwapResponse;
  try {
    validatedSwapResponse = parseMcpToolResponsePayload(swapResponseRaw, SwapResponseSchema);
  } catch (error) {
    context.log('MCP tool swapTokens returned invalid data structure:', error);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: (error as Error).message }],
        },
      },
    };
  }
  const rawSwapTransactions = validatedSwapResponse.transactions;

  if (rawSwapTransactions.length === 0) {
    context.log('Invalid or empty transaction plan received from MCP tool:', rawSwapTransactions);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Swap service returned an empty transaction plan.' }],
        },
      },
    };
  }

  const firstSwapTx = rawSwapTransactions[0] as TransactionPlan;
  if (!firstSwapTx || typeof firstSwapTx !== 'object' || !('to' in firstSwapTx)) {
    context.log('Invalid swap transaction object received from MCP:', firstSwapTx);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: 'Swap service returned an invalid transaction structure.',
            },
          ],
        },
      },
    };
  }
  const spenderAddress = (firstSwapTx as TransactionPlan).to as Address;

  context.log(
    `Checking allowance: User ${userAddress} needs to allow Spender ${spenderAddress} to spend ${atomicAmount} of Token ${fromTokenAddress} on Chain ${txChainId}`
  );

  let currentAllowance: bigint = 0n;
  try {
    currentAllowance = (await publicClient.readContract({
      address: fromTokenAddress,
      abi: Erc20Abi,
      functionName: 'allowance',
      args: [userAddress, spenderAddress],
    })) as bigint;
    context.log(`Successfully read allowance: ${currentAllowance}. Required: ${atomicAmount}`);
  } catch (readError) {
    context.log(
      `Warning: Failed to read allowance via readContract. Error: ${(readError as Error).message}`
    );
    context.log('Assuming allowance is insufficient due to check failure.');
  }

  let approveTxResponse: TransactionPlan | undefined;
  if (currentAllowance < atomicAmount) {
    context.log(
      `Insufficient allowance or check failed. Need ${atomicAmount}, have ${currentAllowance}. Preparing approval transaction...`
    );
    approveTxResponse = {
      to: fromTokenAddress,
      data: encodeFunctionData({
        abi: Erc20Abi,
        functionName: 'approve',
        args: [spenderAddress, BigInt(2) ** BigInt(256) - BigInt(1)],
      }),
      value: '0',
      chainId: txChainId,
    };
  } else {
    context.log('Sufficient allowance already exists.');
  }

  context.log('Validating the swap transactions received from MCP tool...');
  const validatedSwapTxPlan: TransactionPlan[] = validateTransactionPlans(rawSwapTransactions);

  const finalTxPlan: TransactionPlan[] = [
    ...(approveTxResponse ? [approveTxResponse] : []),
    ...validatedSwapTxPlan,
  ];

  const txArtifact: SwapTransactionArtifact = {
    txPreview: {
      fromTokenSymbol: fromToken,
      fromTokenAddress: validatedSwapResponse.baseToken.address,
      fromTokenAmount: validatedSwapResponse.estimation.baseTokenDelta,
      fromChain: validatedSwapResponse.baseToken.chainId,
      toTokenSymbol: toToken,
      toTokenAddress: validatedSwapResponse.quoteToken.address,
      toTokenAmount: validatedSwapResponse.estimation.quoteTokenDelta,
      toChain: validatedSwapResponse.quoteToken.chainId,
      exchangeRate: validatedSwapResponse.estimation.effectivePrice,
      executionTime: validatedSwapResponse.estimation.timeEstimate,
      expiration: validatedSwapResponse.estimation.expiration,
      explorerUrl: validatedSwapResponse.providerTracking.explorerUrl,
    },
    txPlan: finalTxPlan,
  };

  return {
    id: context.userAddress,
    status: {
      state: 'completed',
      message: {
        role: 'agent',
        parts: [
          {
            type: 'text',
            text: `Transaction plan created for swapping ${amount} ${fromToken} to ${toToken}. Ready to sign.`,
          },
        ],
      },
    },
    artifacts: [
      {
        name: 'transaction-plan',
        parts: [
          {
            type: 'data',
            // The double-cast is intentional: DataPart expects Record<string, unknown>,
            // but our artifact is validated by schema elsewhere.
            data: txArtifact as unknown as Record<string, unknown>,
          },
        ],
      },
    ],
  };
}

export async function handlePredictTrade(
  params: {
    token: string;
  },
  context: HandlerContext
): Promise<Task> {
  const { token } = params;
  try {
    const topics = await fetchAlloraTopics(context);

    // Debug: Print entire topics list
    // NOTE: Commented out verbose debugging - the LLM now intelligently selects topics
    /*
    context.log('=== COMPLETE ALLORA TOPICS LIST FOR DEBUGGING ===');
    topics.forEach((topic, index) => {
      const topicNameLower = topic.topic_name.toLowerCase();
      if (topicNameLower.includes('btc') || topicNameLower.includes('bitcoin')) {
        context.log(`Topic ${index + 1} (${topic.topic_name} - BTC Full Details):`, topic);
      } else {
        context.log(`Topic ${index + 1} (${topic.topic_name} - Summary):`, {
          id: topic.topic_id,
          name: topic.topic_name,
          worker_count: topic.worker_count,
          reputer_count: topic.reputer_count,
          is_active: topic.is_active,
        });
      }
    });
    context.log('=== END COMPLETE TOPICS LIST ===');
    */

    // If debugging BTC, fetch and log all BTC topic inferences
    // NOTE: Commented out - the LLM now intelligently fetches only relevant inferences
    /*
    if (token.toLowerCase() === 'btc') {
      await debugBtcTopicInferences(topics, context);
    }
    */

    // Use two-stage LLM approach to find the best predictions for a token
    const { shortTermPrediction, longTermPrediction } = await findBestPredictionsForToken(
      token,
      topics,
      context
    );

    if (!shortTermPrediction && !longTermPrediction) {
      return {
        id: context.userAddress || 'unknown-user',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `LLM could not find any suitable short-term or long-term prediction topics for ${token}.`,
              },
            ],
          },
        },
      };
    }

    // Validate topics meet reliability thresholds
    const MIN_WORKERS = 10;
    const MIN_REPUTERS = 3;

    // Format results - we already have the inferences from the two-stage LLM approach
    const predictions: Array<{
      timeframe: string;
      topic: AlloraTopic;
      inference: InferenceResponse;
    }> = [];

    // Add predictions that passed validation
    if (
      shortTermPrediction &&
      shortTermPrediction.topic.worker_count >= MIN_WORKERS &&
      shortTermPrediction.topic.reputer_count >= MIN_REPUTERS &&
      shortTermPrediction.topic.is_active
    ) {
      predictions.push({
        timeframe: shortTermPrediction.timeframe,
        topic: shortTermPrediction.topic,
        inference: shortTermPrediction.inference,
      });
    }

    if (
      longTermPrediction &&
      longTermPrediction.topic.worker_count >= MIN_WORKERS &&
      longTermPrediction.topic.reputer_count >= MIN_REPUTERS &&
      longTermPrediction.topic.is_active
    ) {
      predictions.push({
        timeframe: longTermPrediction.timeframe,
        topic: longTermPrediction.topic,
        inference: longTermPrediction.inference,
      });
    }

    if (predictions.length === 0) {
      const rejectedTopics = [shortTermPrediction?.topic, longTermPrediction?.topic].filter(
        Boolean
      );
      const rejectionReasons = rejectedTopics
        .map(
          topic =>
            `${topic!.topic_name}: ${topic!.worker_count} workers (need ${MIN_WORKERS}), ${topic!.reputer_count} reputers (need ${MIN_REPUTERS})`
        )
        .join('; ');

      return {
        id: context.userAddress || 'unknown-user',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Found topics for ${token} but none meet reliability thresholds: ${rejectionReasons}`,
              },
            ],
          },
        },
      };
    }

    // Format results
    const resultText = predictions
      .map(({ timeframe, topic, inference }) => {
        const prediction = inference.inference_data.network_inference_normalized;
        context.log(
          `[DEBUG INFERENCE - ${topic.topic_name}] Timeframe: ${timeframe}:`,
          inference // Log the entire inference object
        );
        return `${timeframe} prediction for ${token}: $${prediction} (from ${topic.topic_name} with ${topic.worker_count} workers)`;
      })
      .join('\n');

    // Check if we have both short and long term predictions after validation
    if (!shortTermPrediction || !longTermPrediction) {
      let errorDetail = '';
      if (!shortTermPrediction) {
        errorDetail += 'LLM did not select a short-term prediction. ';
      }

      if (!longTermPrediction) {
        errorDetail += 'LLM did not select a long-term prediction. ';
      }
      return {
        id: context.userAddress || 'unknown-user',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Failed to secure both short and long-term predictions for ${token}. ${errorDetail.trim()}`,
              },
            ],
          },
        },
      };
    }

    // At this point, we have validated both short and long term predictions

    return {
      id: context.userAddress || 'unknown-user',
      status: {
        state: 'completed',
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: resultText }],
        },
      },
    };
  } catch (error: any) {
    return {
      id: context.userAddress || 'unknown-user',
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Error fetching prediction for token ${token}: ${error.message}`,
            },
          ],
        },
      },
    };
  }
}

// Fetch all available topics from Allora MCP server
export async function fetchAlloraTopics(context: HandlerContext): Promise<AlloraTopic[]> {
  if (!context.alloraMcpClient) {
    throw new Error('Allora MCP client not initialized.');
  }
  context.log('Fetching Allora topics via MCP...');
  const rawResult = await context.alloraMcpClient.callTool({
    name: 'list_all_topics',
    arguments: {},
  });
  const topics = parseMcpToolResponsePayload(rawResult, ListAllTopicsResponseSchema);
  context.log(`Fetched ${topics.length} topics from Allora.`);
  return topics;
}

// Fetch inference for a specific topic ID from Allora MCP server
export async function fetchAlloraInference(
  topicID: number,
  context: HandlerContext
): Promise<InferenceResponse> {
  if (!context.alloraMcpClient) {
    throw new Error('Allora MCP client not initialized.');
  }
  context.log(`Fetching inference for Allora topic ID ${topicID} via MCP...`);
  const rawResult = await context.alloraMcpClient.callTool({
    name: 'get_inference_by_topic_id',
    arguments: { topicID },
  });
  const inference = parseMcpToolResponsePayload(rawResult, InferenceResponseSchema);
  context.log(`Fetched inference for topic ID ${topicID}.`);
  return inference;
}

// Use two-stage LLM approach to find the best predictions for a token
async function findBestPredictionsForToken(
  token: string,
  topics: AlloraTopic[],
  context: HandlerContext
): Promise<{
  shortTermPrediction: {
    topic: AlloraTopic;
    inference: InferenceResponse;
    timeframe: string;
  } | null;
  longTermPrediction: {
    topic: AlloraTopic;
    inference: InferenceResponse;
    timeframe: string;
  } | null;
}> {
  if (!context.openRouterApiKey) {
    context.log('OpenRouter API key not available');
    return { shortTermPrediction: null, longTermPrediction: null };
  }

  if (topics.length === 0) {
    return { shortTermPrediction: null, longTermPrediction: null };
  }

  try {
    const openrouter = createOpenRouter({
      apiKey: context.openRouterApiKey,
    });

    // Stage 1: Find all topics related to the token
    context.log(`Stage 1: Finding topics related to ${token}...`);

    const topicFinderPrompt = `You are analyzing cryptocurrency prediction topics to find ALL topics related to the token "${token}".

All available topics:
${topics.map(t => `- ID: ${t.topic_id}, Name: "${t.topic_name}", Workers: ${t.worker_count}, Reputers: ${t.reputer_count}, Active: ${t.is_active}`).join('\n')}

Find ALL topics that could be related to predicting the price of "${token}". Consider:
- Exact token symbol matches (e.g., "BTC" for Bitcoin, "ETH" for Ethereum)
- Common alternative names (e.g., "Bitcoin" for BTC, "Ethereum" for ETH)
- Only select ACTIVE topics (Active: true)
- Only select PRICE PREDICTION topics (not volatility, volume, or other types)
- Include topics with various timeframes (5min, 10min, 8h, 24h, etc.)

Return ALL relevant topic IDs, not just the best ones.`;

    const topicFinderResult = await generateObject({
      model: openrouter('google/gemini-2.5-flash-preview-05-20'),
      schema: TopicFinderSchema,
      prompt: topicFinderPrompt,
      maxTokens: 500,
    });

    context.log(`Stage 1 result:`, topicFinderResult.object);

    // Get the related topics
    const relatedTopics = topicFinderResult.object.relatedTopicIds
      .map(id => topics.find(t => t.topic_id.toString() === id))
      .filter(Boolean) as AlloraTopic[];

    if (relatedTopics.length === 0) {
      context.log('No related topics found');
      return { shortTermPrediction: null, longTermPrediction: null };
    }

    // Stage 2: Fetch inferences for all related topics
    context.log(`Stage 2: Fetching inferences for ${relatedTopics.length} topics...`);

    const topicInferencePairs: { topic: AlloraTopic; inference: InferenceResponse }[] = [];

    for (const topic of relatedTopics) {
      try {
        const inference = await fetchAlloraInference(topic.topic_id, context);
        topicInferencePairs.push({ topic, inference });
        context.log(
          `Fetched inference for ${topic.topic_name}: $${inference.inference_data.network_inference_normalized}`
        );
      } catch (error) {
        context.log(`Failed to fetch inference for ${topic.topic_name}:`, error);
      }
    }

    if (topicInferencePairs.length === 0) {
      context.log('No inferences could be fetched');
      return { shortTermPrediction: null, longTermPrediction: null };
    }

    // Stage 3: Use LLM to select best predictions based on actual data
    context.log(
      `Stage 3: Selecting best predictions from ${topicInferencePairs.length} valid options...`
    );

    const predictionSelectorPrompt = `You are selecting the best cryptocurrency predictions for ${token} based on actual inference data.

Available topic and inference pairs:
${topicInferencePairs
  .map(
    ({ topic, inference }) =>
      `- Topic ${topic.topic_id} (${topic.topic_name}): $${inference.inference_data.network_inference_normalized}, ${topic.worker_count} workers, ${topic.reputer_count} reputers`
  )
  .join('\n')}

Select the best short-term (≤1 hour) and long-term (>1 hour) predictions considering:
1. Prediction reasonableness (realistic price for ${token})
2. Worker participation (higher is generally better)
3. Timeframe appropriateness
4. Avoid obvious outliers or corrupt data

Return timeframes as {value: number, unit: 'minute'|'hour'|'day'} format.
Set confidence based on worker count and price reasonableness.`;

    const predictionSelectorResult = await generateObject({
      model: openrouter('google/gemini-2.5-flash-preview-05-20'),
      schema: PredictionSelectorSchema,
      prompt: predictionSelectorPrompt,
      maxTokens: 800,
    });

    context.log(`Stage 3 result:`, predictionSelectorResult.object);

    // Convert results to our return format
    const result = {
      shortTermPrediction: null as any,
      longTermPrediction: null as any,
    };

    if (predictionSelectorResult.object.shortTermPrediction) {
      const shortTermTopicId = predictionSelectorResult.object.shortTermPrediction.topicId;
      const shortTermPair = topicInferencePairs.find(
        pair => pair.topic.topic_id.toString() === shortTermTopicId
      );
      if (shortTermPair) {
        const timeframe = predictionSelectorResult.object.shortTermPrediction.timeframe;
        result.shortTermPrediction = {
          topic: shortTermPair.topic,
          inference: shortTermPair.inference,
          timeframe: `${timeframe.value} ${timeframe.unit}${timeframe.value !== 1 ? 's' : ''}`,
        };
      }
    }

    if (predictionSelectorResult.object.longTermPrediction) {
      const longTermTopicId = predictionSelectorResult.object.longTermPrediction.topicId;
      const longTermPair = topicInferencePairs.find(
        pair => pair.topic.topic_id.toString() === longTermTopicId
      );
      if (longTermPair) {
        const timeframe = predictionSelectorResult.object.longTermPrediction.timeframe;
        result.longTermPrediction = {
          topic: longTermPair.topic,
          inference: longTermPair.inference,
          timeframe: `${timeframe.value} ${timeframe.unit}${timeframe.value !== 1 ? 's' : ''}`,
        };
      }
    }

    return result;
  } catch (error) {
    context.log(`Two-stage LLM prediction selection failed:`, error);
    return { shortTermPrediction: null, longTermPrediction: null };
  }
}

// Helper function to debug BTC topic inferences
async function debugBtcTopicInferences(topics: AlloraTopic[], context: HandlerContext) {
  context.log('\n=== DEBUGGING ALL ACTIVE BTC PREDICTION TOPIC INFERENCES ===');
  const btcPredictionTopics = topics.filter(
    topic =>
      (topic.topic_name.toLowerCase().includes('btc') ||
        topic.topic_name.toLowerCase().includes('bitcoin')) &&
      topic.topic_name.toLowerCase().includes('prediction') &&
      !topic.topic_name.toLowerCase().includes('volatility') &&
      topic.is_active
  );

  if (btcPredictionTopics.length === 0) {
    context.log('No active BTC prediction topics found for debugging.');
    context.log('=== END BTC DEBUGGING ===\n');
    return;
  }

  for (const topic of btcPredictionTopics) {
    try {
      context.log(
        `Fetching debug inference for: ${topic.topic_name} (ID: ${topic.topic_id}, Workers: ${topic.worker_count}, Reputers: ${topic.reputer_count})`
      );
      const inference = await fetchAlloraInference(topic.topic_id, context);
      context.log(
        `  [DEBUG BTC INFERENCE - ${topic.topic_name}]:`,
        inference // Log the entire inference object
      );
    } catch (error) {
      context.log(
        `  Error fetching debug inference for ${topic.topic_name}:`,
        (error as Error).message
      );
    }
  }
  context.log('=== END BTC DEBUGGING ===\n');
}
