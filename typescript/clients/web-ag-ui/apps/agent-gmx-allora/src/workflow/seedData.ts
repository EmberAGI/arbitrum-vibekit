import { ROOT_AUTHORITY } from '@metamask/delegation-toolkit';

import type { AlloraPrediction, GmxMarket } from '../domain/types.js';

import type { DelegationIntentSummary, FundingTokenOption, UnsignedDelegation } from './context.js';

const ZERO_WORD = `0x${'0'.repeat(64)}` as const;
const SALT_WORD = `0x${'1'.repeat(64)}` as const;

const USDC_ADDRESS = '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as const;
const USDT_ADDRESS = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9' as const;
const WETH_ADDRESS = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' as const;
const ARB_ADDRESS = '0x912ce59144191c1204e64559fe8253a0e49e6548' as const;

export const MARKETS: GmxMarket[] = [
  {
    address: '0x47c031236e19d024b42f8ae6780e44a573170703',
    baseSymbol: 'BTC',
    quoteSymbol: 'USDC',
    token0: { symbol: 'BTC' },
    token1: { symbol: 'USDC' },
    maxLeverage: 2,
  },
  {
    address: '0x70d95587d40a2caf56bd97485ab3eec10bee6336',
    baseSymbol: 'ETH',
    quoteSymbol: 'USDC',
    token0: { symbol: 'ETH' },
    token1: { symbol: 'USDC' },
    maxLeverage: 2,
  },
];

export const FUNDING_TOKENS: FundingTokenOption[] = [
  {
    address: USDC_ADDRESS,
    symbol: 'USDC',
    decimals: 6,
    balance: '3500000000',
  },
  {
    address: USDT_ADDRESS,
    symbol: 'USDT',
    decimals: 6,
    balance: '2100000000',
  },
  {
    address: WETH_ADDRESS,
    symbol: 'WETH',
    decimals: 18,
    balance: '32000000000000000000',
  },
  {
    address: ARB_ADDRESS,
    symbol: 'ARB',
    decimals: 18,
    balance: '1250000000000000000000',
  },
];

export const ALLORA_PREDICTIONS: Record<'BTC' | 'ETH', AlloraPrediction> = {
  BTC: {
    topic: 'allora:btc:8h',
    horizonHours: 8,
    confidence: 0.71,
    direction: 'up',
    predictedPrice: 46950,
    timestamp: new Date().toISOString(),
  },
  ETH: {
    topic: 'allora:eth:8h',
    horizonHours: 8,
    confidence: 0.64,
    direction: 'down',
    predictedPrice: 2520,
    timestamp: new Date().toISOString(),
  },
};

export const DELEGATION_INTENTS: DelegationIntentSummary[] = [
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

export const DELEGATION_DESCRIPTIONS = [
  'Swap into USDC collateral for GMX perps.',
  'Open, reduce, and close GMX perp positions on your behalf.',
  'Use Allora predictions to size low-leverage trades.',
];

export const DELEGATION_WARNINGS = ['This delegation flow is for testing only.'];

export function buildDelegations(params: {
  delegatorAddress: `0x${string}`;
  delegateeAddress: `0x${string}`;
}): UnsignedDelegation[] {
  return [
    {
      delegate: params.delegateeAddress,
      delegator: params.delegatorAddress,
      authority: ROOT_AUTHORITY,
      // Keep this open for now; in production we'd want to constrain scope via caveats.
      caveats: [],
      salt: SALT_WORD,
    },
  ];
}

export const ALLOWED_TOKENS = ['USDC', 'USDT', 'WETH', 'ARB', 'BTC', 'ETH'];
