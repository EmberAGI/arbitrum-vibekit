import type { CamelotPool } from '../domain/types.js';

import type {
  DelegationIntentSummary,
  FundingTokenOption,
  UnsignedDelegation,
} from './context.js';

export const MOCK_AGENT_WALLET_ADDRESS =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
export const MOCK_DELEGATION_MANAGER =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
export const MOCK_DELEGATION_ENFORCER =
  '0xcccccccccccccccccccccccccccccccccccccccc' as const;
const ZERO_WORD = `0x${'0'.repeat(64)}` as const;
const SALT_WORD = `0x${'1'.repeat(64)}` as const;

const WETH_ADDRESS = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' as const;
const USDC_ADDRESS = '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as const;
const USDT_ADDRESS = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9' as const;
const ARB_ADDRESS = '0x912ce59144191c1204e64559fe8253a0e49e6548' as const;

export const MOCK_POOLS: CamelotPool[] = [
  {
    address: '0x1111111111111111111111111111111111111111',
    token0: {
      address: WETH_ADDRESS,
      symbol: 'WETH',
      decimals: 18,
      usdPrice: 2000,
    },
    token1: {
      address: USDC_ADDRESS,
      symbol: 'USDC',
      decimals: 6,
      usdPrice: 1,
    },
    tickSpacing: 60,
    tick: 0,
    liquidity: '900000',
    activeTvlUSD: 1_200_000,
    feeTierBps: 5,
  },
  {
    address: '0x2222222222222222222222222222222222222222',
    token0: {
      address: ARB_ADDRESS,
      symbol: 'ARB',
      decimals: 18,
      usdPrice: 1.5,
    },
    token1: {
      address: USDC_ADDRESS,
      symbol: 'USDC',
      decimals: 6,
      usdPrice: 1,
    },
    tickSpacing: 10,
    tick: 120,
    liquidity: '450000',
    activeTvlUSD: 650_000,
    feeTierBps: 30,
  },
  {
    address: '0x3333333333333333333333333333333333333333',
    token0: {
      address: WETH_ADDRESS,
      symbol: 'WETH',
      decimals: 18,
      usdPrice: 2000,
    },
    token1: {
      address: USDT_ADDRESS,
      symbol: 'USDT',
      decimals: 6,
      usdPrice: 1,
    },
    tickSpacing: 60,
    tick: -40,
    liquidity: '520000',
    activeTvlUSD: 900_000,
    feeTierBps: 5,
  },
];

export const MOCK_FUNDING_TOKENS: FundingTokenOption[] = [
  {
    address: USDC_ADDRESS,
    symbol: 'USDC',
    decimals: 6,
    balance: '2500000000',
  },
  {
    address: USDT_ADDRESS,
    symbol: 'USDT',
    decimals: 6,
    balance: '1250000000',
  },
  {
    address: WETH_ADDRESS,
    symbol: 'WETH',
    decimals: 18,
    balance: '1500000000000000000',
  },
  {
    address: ARB_ADDRESS,
    symbol: 'ARB',
    decimals: 18,
    balance: '450000000000000000000',
  },
];

export const MOCK_INTENTS: DelegationIntentSummary[] = [
  {
    target: '0xdddddddddddddddddddddddddddddddddddddddd',
    selector: '0x0c49ccbe',
    allowedCalldata: [],
  },
  {
    target: '0xdddddddddddddddddddddddddddddddddddddddd',
    selector: '0xfc6f7865',
    allowedCalldata: [{ startIndex: 36, value: ZERO_WORD }],
  },
];

export const MOCK_DELEGATION_DESCRIPTIONS = [
  'Rebalance Camelot CLMM positions on your behalf.',
  'Swap between pool assets to maintain target ranges.',
  'Claim fees and rewards into your wallet.',
];

export const MOCK_DELEGATION_WARNINGS = [
  'This is a mocked delegation flow for testing only.',
];

export function buildMockDelegations(
  delegatorAddress: `0x${string}`,
): UnsignedDelegation[] {
  return [
    {
      delegate: MOCK_AGENT_WALLET_ADDRESS,
      delegator: delegatorAddress,
      authority: ZERO_WORD,
      caveats: [
        {
          enforcer: MOCK_DELEGATION_ENFORCER,
          terms: ZERO_WORD,
          args: ZERO_WORD,
        },
      ],
      salt: SALT_WORD,
    },
  ];
}
