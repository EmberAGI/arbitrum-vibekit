import type { Address, Chain } from 'viem';
import { createPublicClient, http, isAddress } from 'viem';
import { arbitrum, mainnet } from 'viem/chains';
import { z } from 'zod';

export const SupportedChainId = z.union([z.literal('42161'), z.literal('1'), z.literal(42161), z.literal(1)]).transform((v: string | number) => Number(v) as 42161 | 1);
export type SupportedChainId = z.infer<typeof SupportedChainId>;

export const envSchema = z.object({
  ARBITRUM_RPC_URL: z.string().url().describe('Arbitrum RPC URL'),
  ETHEREUM_RPC_URL: z.string().url().optional(),
});

export function getChainById(chainId: SupportedChainId): Chain {
  switch (chainId) {
    case 42161:
      return arbitrum;
    case 1:
      return mainnet;
    default:
      throw new Error(`Unsupported chain id: ${chainId}`);
  }
}

export function getPublicClient(chainId: SupportedChainId, env: z.infer<typeof envSchema>) {
  const url = chainId === 42161 ? env.ARBITRUM_RPC_URL : env.ETHEREUM_RPC_URL;
  if (!url) throw new Error(`Missing RPC URL for chain ${chainId}`);
  return createPublicClient({ chain: getChainById(chainId), transport: http(url) });
}

export const addressSchema = z.string().refine((v: string) => isAddress(v), 'Invalid address');

export const listRoutesInput = z.object({
  originChainId: SupportedChainId.default('42161'),
  destinationChainId: SupportedChainId.default('1'),
  tokenIn: addressSchema.describe('ERC20 token to bridge from origin').optional(),
  tokenOut: addressSchema.describe('ERC20 token to receive on destination').optional(),
});

export const estimateQuoteInput = z.object({
  originChainId: SupportedChainId,
  destinationChainId: SupportedChainId,
  tokenIn: addressSchema,
  tokenOut: addressSchema,
  amountIn: z.string().regex(/^\d+$/, 'amountIn must be a base units integer string'),
});

export type ListRoutesInput = z.infer<typeof listRoutesInput>;
export type EstimateQuoteInput = z.infer<typeof estimateQuoteInput>;

export type BridgeRoute = {
  protocol: 'across' | 'stargate';
  originChainId: SupportedChainId;
  destinationChainId: SupportedChainId;
  tokenIn: Address;
  tokenOut: Address;
};

export function listRoutes(input: ListRoutesInput): BridgeRoute[] {
  const routes: BridgeRoute[] = [];

  // Common tokens for demonstration
  const commonTokens = {
    42161: ['0xaf88d065e77c8cC2239327C5EDb3A432268e5831'], // USDC on Arbitrum
    1: ['0xA0b86a33E6417c4b7E0b27c4E1b3E6F2f8b3b8c2'], // USDC on Mainnet (example)
  };

  if (input.tokenIn && input.tokenOut) {
    // Specific route requested
    routes.push({
      protocol: 'across',
      originChainId: input.originChainId as SupportedChainId,
      destinationChainId: input.destinationChainId as SupportedChainId,
      tokenIn: input.tokenIn as Address,
      tokenOut: input.tokenOut as Address,
    });
  } else {
    // Return available routes for common tokens
    const originTokens = commonTokens[input.originChainId] || [];
    const destTokens = commonTokens[input.destinationChainId] || [];
    
    for (const tokenIn of originTokens) {
      for (const tokenOut of destTokens) {
        routes.push({
          protocol: 'across',
          originChainId: input.originChainId as SupportedChainId,
          destinationChainId: input.destinationChainId as SupportedChainId,
          tokenIn: tokenIn as Address,
          tokenOut: tokenOut as Address,
        });
      }
    }
  }

  return routes;
}

export const oracleInput = z.object({
  chainId: SupportedChainId,
  tokenAddress: addressSchema,
});

// Chainlink AggregatorV3 ABI (minimal for latestRoundData)
export const aggregatorV3Abi = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'latestRoundData',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  { type: 'function', stateMutability: 'view', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

// Known Chainlink price feeds for major tokens
const CHAINLINK_FEEDS: Record<number, Record<string, string>> = {
  42161: { // Arbitrum
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3', // USDC/USD
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3', // USDC.e/USD (same feed)
  },
  1: { // Ethereum Mainnet
    '0xa0b86a33e6417c4b7e0b27c4e1b3e6f2f8b3b8c2': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6', // USDC/USD
  },
};

export async function getOraclePriceUSD(input: z.infer<typeof oracleInput>, env: z.infer<typeof envSchema>): Promise<{ price: string; decimals: number; updatedAt: number }> {
  const { chainId, tokenAddress } = input;
  const feedAddress = CHAINLINK_FEEDS[chainId]?.[tokenAddress.toLowerCase()];
  
  if (!feedAddress) {
    throw new Error(`No Chainlink feed found for token ${tokenAddress} on chain ${chainId}`);
  }

  const client = getPublicClient(chainId, env);
  
  try {
    const [roundData, decimals] = await Promise.all([
      client.readContract({
        address: feedAddress as Address,
        abi: aggregatorV3Abi,
        functionName: 'latestRoundData',
      }),
      client.readContract({
        address: feedAddress as Address,
        abi: aggregatorV3Abi,
        functionName: 'decimals',
      }),
    ]);

    const [, answer, , updatedAt] = roundData;
    
    return {
      price: answer.toString(),
      decimals: Number(decimals),
      updatedAt: Number(updatedAt),
    };
  } catch (error) {
    throw new Error(`Failed to fetch oracle price: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const validateQuoteInput = z.object({
  expectedUsdPerToken: z.string().regex(/^(?:\d+)(?:\.\d+)?$/),
  quotedOut: z.string().regex(/^\d+$/),
  outDecimals: z.number().int().min(0).max(36),
  maxDeviationBps: z.number().int().min(1).max(5000).default(300),
});

export function validateDestinationQuoteAgainstOracle({ expectedUsdPerToken, quotedOut, outDecimals, maxDeviationBps }: z.infer<typeof validateQuoteInput>) {
  const quoted = Number(quotedOut) / 10 ** outDecimals;
  const expected = Number(expectedUsdPerToken);
  if (!Number.isFinite(quoted) || !Number.isFinite(expected)) throw new Error('Non-finite values');
  const deviation = Math.abs(quoted - expected) / (expected || 1);
  if (deviation > maxDeviationBps / 10_000) {
    throw new Error(`Quote deviates ${Math.round(deviation * 100)}% > allowed ${(maxDeviationBps / 100).toFixed(2)}%`);
  }
  return { ok: true, deviation } as const;
}

export const minOutInput = z.object({
  quotedOut: z.string().regex(/^\d+$/),
  outDecimals: z.number().int().min(0).max(36),
  slippageBps: z.number().int().min(1).max(5000),
});

export function computeMinOut({ quotedOut, outDecimals, slippageBps }: z.infer<typeof minOutInput>) {
  const amount = BigInt(quotedOut);
  const minOut = (amount * BigInt(10_000 - slippageBps)) / 10_000n;
  return { minOut: minOut.toString(), humanReadable: (Number(minOut) / 10 ** outDecimals).toString() };
}

export const deadlineInput = z.object({ minutesFromNow: z.number().int().min(1).max(180).default(20) });
export function computeDeadline({ minutesFromNow }: z.infer<typeof deadlineInput>) {
  const now = Math.floor(Date.now() / 1000);
  return { deadline: now + minutesFromNow * 60 };
}

export const approvalInput = z.object({ token: addressSchema, spender: addressSchema, amount: z.string().regex(/^\d+$/) });

export const erc20Abi = [
  { type: 'function', stateMutability: 'nonpayable', name: 'approve', inputs: [ { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' } ], outputs: [ { type: 'bool' } ] },
] as const;

export function buildApprovalTx({ token, spender, amount }: z.infer<typeof approvalInput>) {
  return {
    to: token as Address,
    data: {
      abi: erc20Abi,
      functionName: 'approve' as const,
      args: [spender as Address, BigInt(amount)],
    },
    value: '0',
  };
}

export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;

// Across SpokePool addresses
const ACROSS_ADDRESSES = {
  arbitrum: { spokePool: '0xe35e9842fceaca96570b734083f4a58e8f7c5f2a' },
  mainnet: { spokePool: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5' },
} as const;

export function getAcrossAddresses(env: z.infer<typeof envSchema>) {
  return {
    arbitrum: { 
      spokePool: process.env.ACROSS_SPOKEPOOL_ARBITRUM || ACROSS_ADDRESSES.arbitrum.spokePool 
    },
    mainnet: { 
      spokePool: process.env.ACROSS_SPOKEPOOL_MAINNET || ACROSS_ADDRESSES.mainnet.spokePool 
    },
  };
}

export function getSupportedAddresses() {
  return {
    permit2: PERMIT2_ADDRESS,
    across: ACROSS_ADDRESSES,
    // TODO: Add Stargate addresses
  } as const;
}

// EIP-2612 Permit schemas and builder
export const eip2612PermitInput = z.object({
  chainId: SupportedChainId,
  tokenAddress: addressSchema,
  owner: addressSchema,
  spender: addressSchema,
  value: z.string().regex(/^\d+$/),
  nonce: z.string().regex(/^\d+$/),
  deadline: z.string().regex(/^\d+$/),
});

export function buildEip2612Permit(input: z.infer<typeof eip2612PermitInput>) {
  return {
    domain: {
      name: 'USD Coin', // This should be fetched from token contract in production
      version: '2',
      chainId: Number(input.chainId),
      verifyingContract: input.tokenAddress as Address,
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit' as const,
    message: {
      owner: input.owner as Address,
      spender: input.spender as Address,
      value: input.value, // Keep as string for JSON serialization
      nonce: input.nonce, // Keep as string for JSON serialization
      deadline: input.deadline, // Keep as string for JSON serialization
    },
  };
}

// Permit2 schemas and builder
export const permit2PermitInput = z.object({
  chainId: SupportedChainId,
  tokenAddress: addressSchema,
  owner: addressSchema,
  spender: addressSchema,
  amount: z.string().regex(/^\d+$/),
  expiration: z.string().regex(/^\d+$/),
  nonce: z.string().regex(/^\d+$/),
  sigDeadline: z.string().regex(/^\d+$/),
});

export function buildPermit2Permit(input: z.infer<typeof permit2PermitInput>) {
  return {
    domain: {
      name: 'Permit2',
      chainId: Number(input.chainId),
      verifyingContract: PERMIT2_ADDRESS,
    },
    types: {
      PermitSingle: [
        { name: 'details', type: 'PermitDetails' },
        { name: 'spender', type: 'address' },
        { name: 'sigDeadline', type: 'uint256' },
      ],
      PermitDetails: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' },
        { name: 'nonce', type: 'uint48' },
      ],
    },
    primaryType: 'PermitSingle' as const,
    message: {
      details: {
        token: input.tokenAddress as Address,
        amount: input.amount, // Keep as string for JSON serialization
        expiration: input.expiration, // Keep as string for JSON serialization
        nonce: input.nonce, // Keep as string for JSON serialization
      },
      spender: input.spender as Address,
      sigDeadline: input.sigDeadline, // Keep as string for JSON serialization
    },
  };
}

// Across SpokePool ABI (minimal for deposit)
export const acrossSpokePoolAbi = [
  {
    type: 'function',
    stateMutability: 'payable',
    name: 'deposit',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'originToken', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'destinationChainId', type: 'uint256' },
      { name: 'relayerFeePct', type: 'int64' },
      { name: 'quoteTimestamp', type: 'uint32' },
      { name: 'message', type: 'bytes' },
      { name: 'maxCount', type: 'uint256' },
    ],
    outputs: [],
  },
  { type: 'function', stateMutability: 'view', name: 'getCurrentTime', inputs: [], outputs: [{ type: 'uint32' }] },
  { type: 'function', stateMutability: 'view', name: 'depositQuoteTimeBuffer', inputs: [], outputs: [{ type: 'uint32' }] },
] as const;

// Across quote time window
export const acrossTimeWindowInput = z.object({
  chainId: SupportedChainId,
});

export async function getAcrossQuoteTimeWindow(input: z.infer<typeof acrossTimeWindowInput>, env: z.infer<typeof envSchema>) {
  const acrossAddresses = getAcrossAddresses(env);
  const spokePoolAddress = input.chainId === 42161 ? acrossAddresses.arbitrum.spokePool : acrossAddresses.mainnet.spokePool;
  
  if (!spokePoolAddress || spokePoolAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Across SpokePool address not configured for chain ${input.chainId}`);
  }

  const client = getPublicClient(input.chainId, env);
  
  try {
    const [currentTime, quoteTimeBuffer] = await Promise.all([
      client.readContract({
        address: spokePoolAddress as Address,
        abi: acrossSpokePoolAbi,
        functionName: 'getCurrentTime',
      }),
      client.readContract({
        address: spokePoolAddress as Address,
        abi: acrossSpokePoolAbi,
        functionName: 'depositQuoteTimeBuffer',
      }),
    ]);

    return {
      currentTime: Number(currentTime),
      quoteTimeBuffer: Number(quoteTimeBuffer),
      validQuoteTimestamp: Number(currentTime) - Number(quoteTimeBuffer),
    };
  } catch (error) {
    throw new Error(`Failed to get Across quote time window: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Build Across bridge transaction
export const buildAcrossTxInput = z.object({
  protocol: z.literal('across'),
  originChainId: SupportedChainId,
  destinationChainId: SupportedChainId,
  tokenIn: addressSchema,
  amountIn: z.string().regex(/^\d+$/),
  recipient: addressSchema,
  relayerFeePct: z.string().regex(/^\d+$/),
  quoteTimestamp: z.string().regex(/^\d+$/),
  message: z.string().default('0x'),
  maxCount: z.string().regex(/^\d+$/).default('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
  value: z.string().regex(/^\d+$/).optional(),
});

export function buildAcrossBridgeTx(input: z.infer<typeof buildAcrossTxInput>, env: z.infer<typeof envSchema>) {
  const acrossAddresses = getAcrossAddresses(env);
  const spokePoolAddress = input.originChainId === 42161 ? acrossAddresses.arbitrum.spokePool : acrossAddresses.mainnet.spokePool;

  if (!spokePoolAddress || spokePoolAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Across SpokePool address not configured for chain ${input.originChainId}`);
  }

  return {
    to: spokePoolAddress as Address,
    data: {
      abi: acrossSpokePoolAbi,
      functionName: 'deposit' as const,
      args: [
        input.recipient as Address,
        input.tokenIn as Address,
        BigInt(input.amountIn),
        BigInt(input.destinationChainId),
        BigInt(input.relayerFeePct),
        BigInt(input.quoteTimestamp),
        input.message,
        BigInt(input.maxCount),
      ],
    },
    value: input.value ?? '0', // Across deposit is payable
  };
}

