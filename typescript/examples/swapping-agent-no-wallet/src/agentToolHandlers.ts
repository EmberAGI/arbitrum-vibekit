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
import type { Task } from 'a2a-samples-js/schema';
import Erc20Abi from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };

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

export const TransactionEmberSchema = z
  .object({
    to: z.string(),
    data: z.string(),
    value: z.string(),
  })
  .passthrough();

export type TransactionEmber = z.infer<typeof TransactionEmberSchema>;

export const TransactionResponseSchema = TransactionEmberSchema.extend({
  chainId: z.string(),
});

export type TransactionResponse = z.infer<typeof TransactionResponseSchema>;

export const TransactionArtifactSchema = z.object({
  txPreview: SwapPreviewSchema,
  txPlan: z.array(TransactionResponseSchema),
});

export type TransactionArtifact = z.infer<typeof TransactionArtifactSchema>;

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
  transactions: z.array(TransactionEmberSchema),
});

export type SwapResponse = z.infer<typeof SwapResponseSchema>;

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, TokenInfo[]>;
  userAddress: string | undefined;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
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

export function parseMcpToolResponse(
  rawResponse: unknown,
  context: HandlerContext,
  toolName: string
): unknown {
  let dataToValidate: unknown;

  if (
    rawResponse &&
    typeof rawResponse === 'object' &&
    'content' in rawResponse &&
    Array.isArray((rawResponse as any).content) &&
    (rawResponse as any).content.length > 0 &&
    (rawResponse as any).content[0]?.type === 'text' &&
    typeof (rawResponse as any).content[0]?.text === 'string'
  ) {
    context.log(`Raw ${toolName} result appears nested, parsing inner text...`);
    try {
      const parsedData = JSON.parse((rawResponse as any).content[0].text);
      dataToValidate = parsedData;
    } catch (e) {
      context.log(`Error parsing inner text content from ${toolName} result:`, e);
      throw new Error(`Failed to parse nested JSON response from ${toolName}: ${rawResponse}}`);
    }
  } else {
    context.log(
      `Raw ${toolName} result does not have expected nested structure, validating as is.`
    );
    dataToValidate = rawResponse;
  }

  return dataToValidate;
}

function validateTransactions(
  actionName: string,
  rawTransactions: unknown,
  expectedChainId: string,
  context: HandlerContext
): TransactionResponse[] {
  const validationResult = z.array(TransactionEmberSchema).safeParse(rawTransactions);
  if (!validationResult.success) {
    const errorMsg = `MCP tool '${actionName}' returned invalid transaction data structure.`;
    context.log(errorMsg, validationResult.error);
    context.log('Raw data that failed validation:', JSON.stringify(rawTransactions));
    throw new Error(errorMsg);
  }
  context.log(
    `Validated structure for ${validationResult.data.length} transactions for ${actionName}. Adding chainId: ${expectedChainId}`
  );

  const transactionsWithChainId = validationResult.data.map(tx => ({
    ...tx,
    chainId: expectedChainId,
  }));

  const finalValidation = z.array(TransactionResponseSchema).safeParse(transactionsWithChainId);
  if (!finalValidation.success) {
    const errorMsg = `Failed to add required chainId '${expectedChainId}' to transactions for ${actionName}.`;
    context.log(errorMsg, finalValidation.error);
    context.log('Data after adding chainId:', JSON.stringify(transactionsWithChainId));
    throw new Error(errorMsg);
  }

  return finalValidation.data;
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
      abi: Erc20Abi.abi,
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

  const swapResponseRaw = await context.mcpClient.callTool({
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

  const dataToValidate = parseMcpToolResponse(swapResponseRaw, context, 'swapTokens');
  context.log('Parsed swap response data:', dataToValidate);

  const validationResult = SwapResponseSchema.safeParse(dataToValidate);
  if (!validationResult.success) {
    context.log('MCP tool swapTokens returned invalid data structure:', validationResult.error);
    return {
      id: userAddress,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Received invalid response from swap service: ${validationResult.error.message}`,
            },
          ],
        },
      },
    };
  }
  const validatedSwapResponse = validationResult.data;
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

  const firstSwapTx = rawSwapTransactions[0];
  if (!firstSwapTx || typeof firstSwapTx !== 'object' || !firstSwapTx.to) {
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
  const spenderAddress = firstSwapTx.to as Address;

  context.log(
    `Checking allowance: User ${userAddress} needs to allow Spender ${spenderAddress} to spend ${atomicAmount} of Token ${fromTokenAddress} on Chain ${txChainId}`
  );

  let currentAllowance: bigint = 0n;
  try {
    currentAllowance = (await publicClient.readContract({
      address: fromTokenAddress,
      abi: Erc20Abi.abi,
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

  let approveTxResponse: TransactionResponse | undefined;
  if (currentAllowance < atomicAmount) {
    context.log(
      `Insufficient allowance or check failed. Need ${atomicAmount}, have ${currentAllowance}. Preparing approval transaction...`
    );
    approveTxResponse = {
      to: fromTokenAddress,
      data: encodeFunctionData({
        abi: Erc20Abi.abi,
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
  const validatedSwapTxPlan: TransactionResponse[] = validateTransactions(
    'swapTokens',
    rawSwapTransactions,
    txChainId,
    context
  );

  const finalTxPlan: TransactionResponse[] = [
    ...(approveTxResponse ? [approveTxResponse] : []),
    ...validatedSwapTxPlan,
  ];

  const txArtifact: TransactionArtifact = {
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
            data: txArtifact,
          },
        ],
      },
    ],
  };
}
