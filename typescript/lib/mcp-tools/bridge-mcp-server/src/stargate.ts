import type { Address } from 'viem';
import { z } from 'zod';
import { SupportedChainId, addressSchema, getPublicClient, envSchema } from './bridge.js';

// Stargate V2 Chain Support (expanded beyond Across)
export const StargateChainId = z.union([
  z.literal('42161'), z.literal('1'),     // Arbitrum, Ethereum
  z.literal('137'), z.literal('10'),      // Polygon, Optimism  
  z.literal('56'), z.literal('43114'),    // BSC, Avalanche
  z.literal('8453'), z.literal('324'),    // Base, zkSync Era
]).transform((v: string) => Number(v));

export type StargateChainId = z.infer<typeof StargateChainId>;

// Stargate V2 Pool Types
export enum PoolType {
  Standard = 0,
  Credit = 1,
  OFT = 2,
}

// Stargate V2 Router Addresses
export const STARGATE_V2_ADDRESSES = {
  1: {
    router: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
    composer: '0xeCc19E177d24551aA7ed6Bc6FE566eCa726CC8a9',
    oft: '0x13B2211a7cA45Db2808F6dB05557ce5347e3634e',
  },
  42161: {
    router: '0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614',
    composer: '0xeCc19E177d24551aA7ed6Bc6FE566eCa726CC8a9',
    oft: '0x915A55e36A01285A14f05dE6e81ED9cE89772f8e',
  },
  137: {
    router: '0x45A01E4e04F14f7A4a6702c74187c5F6222033cd',
    composer: '0xeCc19E177d24551aA7ed6Bc6FE566eCa726CC8a9',
    oft: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
  },
  10: {
    router: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
    composer: '0xeCc19E177d24551aA7ed6Bc6FE566eCa726CC8a9',
    oft: '0xDecC0c09c3B5f6e92EF4184125D5648a66E35298',
  },
} as const;

// Stargate V2 Pool Configuration
export interface StargatePool {
  chainId: number;
  poolId: number;
  token: Address;
  poolType: PoolType;
  sharedDecimals: number;
  localDecimals: number;
  tvl?: string;
  creditLimit?: string;
}

// Known Stargate V2 Pools (major stablecoins)
export const STARGATE_POOLS: Record<number, StargatePool[]> = {
  1: [
    {
      chainId: 1,
      poolId: 1,
      token: '0xA0b86a33E6417c4b7E0b27c4E1b3E6F2f8b3b8c2' as Address, // USDC
      poolType: PoolType.Standard,
      sharedDecimals: 6,
      localDecimals: 6,
    },
    {
      chainId: 1,
      poolId: 2,
      token: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address, // USDT
      poolType: PoolType.Standard,
      sharedDecimals: 6,
      localDecimals: 6,
    },
  ],
  42161: [
    {
      chainId: 42161,
      poolId: 1,
      token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address, // USDC
      poolType: PoolType.Standard,
      sharedDecimals: 6,
      localDecimals: 6,
    },
    {
      chainId: 42161,
      poolId: 2,
      token: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address, // USDT
      poolType: PoolType.Standard,
      sharedDecimals: 6,
      localDecimals: 6,
    },
  ],
  137: [
    {
      chainId: 137,
      poolId: 1,
      token: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Address, // USDC
      poolType: PoolType.Standard,
      sharedDecimals: 6,
      localDecimals: 6,
    },
  ],
  10: [
    {
      chainId: 10,
      poolId: 1,
      token: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607' as Address, // USDC
      poolType: PoolType.Standard,
      sharedDecimals: 6,
      localDecimals: 6,
    },
  ],
};

// Stargate V2 Router ABI (minimal for swapping)
export const stargateV2RouterAbi = [
  {
    type: 'function',
    stateMutability: 'payable',
    name: 'swap',
    inputs: [
      { name: 'dstEid', type: 'uint32' },
      { name: 'srcPoolId', type: 'uint256' },
      { name: 'dstPoolId', type: 'uint256' },
      { name: 'refundTo', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'composeMsg', type: 'bytes' },
      { name: 'oftCmd', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'quoteFee',
    inputs: [
      { name: 'dstEid', type: 'uint32' },
      { name: 'srcPoolId', type: 'uint256' },
      { name: 'dstPoolId', type: 'uint256' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'composeMsg', type: 'bytes' },
      { name: 'oftCmd', type: 'bytes' },
    ],
    outputs: [
      { name: 'fee', type: 'uint256' },
      { name: 'amountOut', type: 'uint256' },
    ],
  },
] as const;

// Stargate V2 Credit System ABI
export const stargateCreditAbi = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getCredit',
    inputs: [
      { name: 'srcEid', type: 'uint32' },
      { name: 'srcPoolId', type: 'uint256' },
    ],
    outputs: [{ name: 'credit', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getCreditLimit',
    inputs: [
      { name: 'srcEid', type: 'uint32' },
      { name: 'srcPoolId', type: 'uint256' },
    ],
    outputs: [{ name: 'limit', type: 'uint256' }],
  },
] as const;

// Stargate V2 Schemas
export const stargateSwapInput = z.object({
  protocol: z.literal('stargate'),
  originChainId: StargateChainId,
  destinationChainId: StargateChainId,
  tokenIn: addressSchema,
  tokenOut: addressSchema,
  amountIn: z.string().regex(/^\d+$/),
  recipient: addressSchema,
  srcPoolId: z.number().int().min(1),
  dstPoolId: z.number().int().min(1),
  minAmountOut: z.string().regex(/^\d+$/).optional(),
  composeMsg: z.string().default('0x'),
  oftCmd: z.string().default('0x'),
});

export const stargateCreditInput = z.object({
  chainId: StargateChainId,
  poolId: z.number().int().min(1),
});

export const stargatePoolsInput = z.object({
  chainId: StargateChainId.optional(),
  tokenAddress: addressSchema.optional(),
});

// Stargate V2 Functions
export function getStargateAddresses(chainId: number) {
  const addresses = STARGATE_V2_ADDRESSES[chainId as keyof typeof STARGATE_V2_ADDRESSES];
  if (!addresses) {
    throw new Error(`Stargate V2 not supported on chain ${chainId}`);
  }
  return addresses;
}

export function findStargatePool(chainId: number, tokenAddress: string): StargatePool | undefined {
  const pools = STARGATE_POOLS[chainId] || [];
  return pools.find(pool => pool.token.toLowerCase() === tokenAddress.toLowerCase());
}

export function listStargatePools(input: z.infer<typeof stargatePoolsInput>): StargatePool[] {
  if (input.chainId) {
    const pools = STARGATE_POOLS[input.chainId] || [];
    if (input.tokenAddress) {
      const pool = findStargatePool(input.chainId, input.tokenAddress);
      return pool ? [pool] : [];
    }
    return pools;
  }
  
  // Return all pools across all chains
  return Object.values(STARGATE_POOLS).flat();
}

export async function getStargateCredit(
  input: z.infer<typeof stargateCreditInput>,
  env: z.infer<typeof envSchema>
): Promise<{ credit: string; creditLimit: string }> {
  const addresses = getStargateAddresses(input.chainId);
  const client = getPublicClient(input.chainId as any, env);

  try {
    const [credit, creditLimit] = await Promise.all([
      client.readContract({
        address: addresses.router as Address,
        abi: stargateCreditAbi,
        functionName: 'getCredit',
        args: [input.chainId, BigInt(input.poolId)],
      }),
      client.readContract({
        address: addresses.router as Address,
        abi: stargateCreditAbi,
        functionName: 'getCreditLimit',
        args: [input.chainId, BigInt(input.poolId)],
      }),
    ]);

    return {
      credit: credit.toString(),
      creditLimit: creditLimit.toString(),
    };
  } catch (error) {
    throw new Error(`Failed to get Stargate credit: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getStargateQuote(
  input: z.infer<typeof stargateSwapInput>,
  env: z.infer<typeof envSchema>
): Promise<{ fee: string; amountOut: string; creditBased: boolean }> {
  const addresses = getStargateAddresses(input.originChainId);
  const client = getPublicClient(input.originChainId as any, env);

  try {
    const [fee, amountOut] = await client.readContract({
      address: addresses.router as Address,
      abi: stargateV2RouterAbi,
      functionName: 'quoteFee',
      args: [
        input.destinationChainId,
        BigInt(input.srcPoolId),
        BigInt(input.dstPoolId),
        BigInt(input.amountIn),
        input.composeMsg as `0x${string}`,
        input.oftCmd as `0x${string}`,
      ],
    });

    // Check if this can use credit-based bridging
    const srcPool = findStargatePool(input.originChainId, input.tokenIn);
    const creditBased = srcPool?.poolType === PoolType.Credit;

    return {
      fee: fee.toString(),
      amountOut: amountOut.toString(),
      creditBased,
    };
  } catch (error) {
    throw new Error(`Failed to get Stargate quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function buildStargateSwapTx(
  input: z.infer<typeof stargateSwapInput>,
  env: z.infer<typeof envSchema>
) {
  const addresses = getStargateAddresses(input.originChainId);
  
  const minAmountOut = input.minAmountOut || '0';

  return {
    to: addresses.router as Address,
    data: {
      abi: stargateV2RouterAbi,
      functionName: 'swap' as const,
      args: [
        input.destinationChainId,
        BigInt(input.srcPoolId),
        BigInt(input.dstPoolId),
        input.recipient as Address,
        BigInt(input.amountIn),
        BigInt(minAmountOut),
        input.composeMsg as `0x${string}`,
        input.oftCmd as `0x${string}`,
      ],
    },
    value: '0', // Fee is paid separately in native token
  };
}

// Enhanced route discovery with Stargate
export interface EnhancedBridgeRoute {
  protocol: 'across' | 'stargate';
  originChainId: number;
  destinationChainId: number;
  tokenIn: Address;
  tokenOut: Address;
  poolInfo?: {
    srcPoolId: number;
    dstPoolId: number;
    poolType: PoolType;
    creditBased?: boolean;
  };
  estimatedFee?: string;
  estimatedOutput?: string;
  estimatedTime?: string;
}

export function findBestStargateRoute(
  originChainId: number,
  destinationChainId: number,
  tokenIn: string,
  tokenOut: string
): EnhancedBridgeRoute | null {
  const srcPool = findStargatePool(originChainId, tokenIn);
  const dstPool = findStargatePool(destinationChainId, tokenOut);

  if (!srcPool || !dstPool) {
    return null;
  }

  return {
    protocol: 'stargate',
    originChainId,
    destinationChainId,
    tokenIn: tokenIn as Address,
    tokenOut: tokenOut as Address,
    poolInfo: {
      srcPoolId: srcPool.poolId,
      dstPoolId: dstPool.poolId,
      poolType: srcPool.poolType,
      creditBased: srcPool.poolType === PoolType.Credit,
    },
    estimatedTime: srcPool.poolType === PoolType.Credit ? '1-5 minutes' : '10-20 minutes',
  };
}
