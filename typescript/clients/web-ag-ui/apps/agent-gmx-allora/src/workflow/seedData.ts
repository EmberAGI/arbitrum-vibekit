import type { AlloraPrediction, GmxMarket } from '../domain/types.js';

import type { DelegationIntentSummary, FundingTokenOption, UnsignedDelegation } from './context.js';

export const AGENT_WALLET_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
export const DELEGATION_MANAGER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
export const DELEGATION_ENFORCER = '0xcccccccccccccccccccccccccccccccccccccccc' as const;
const ZERO_WORD = `0x${'0'.repeat(64)}` as const;
const SALT_WORD = `0x${'1'.repeat(64)}` as const;

const USDC_ADDRESS = '0x1111111111111111111111111111111111111111' as const;
const USDT_ADDRESS = '0x2222222222222222222222222222222222222222' as const;
const WETH_ADDRESS = '0x3333333333333333333333333333333333333333' as const;
const ARB_ADDRESS = '0x4444444444444444444444444444444444444444' as const;

export const MARKETS: GmxMarket[] = [
  {
    address: '0xaaaa000000000000000000000000000000000101',
    baseSymbol: 'BTC',
    quoteSymbol: 'USDC',
    token0: { symbol: 'BTC' },
    token1: { symbol: 'USDC' },
    maxLeverage: 2,
  },
  {
    address: '0xaaaa000000000000000000000000000000000102',
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

export function buildDelegations(delegatorAddress: `0x${string}`): UnsignedDelegation[] {
  return [
    {
      delegate: AGENT_WALLET_ADDRESS,
      delegator: delegatorAddress,
      authority: ZERO_WORD,
      caveats: [
        {
          enforcer: DELEGATION_ENFORCER,
          terms: ZERO_WORD,
          args: ZERO_WORD,
        },
      ],
      salt: SALT_WORD,
    },
  ];
}

export const ALLOWED_TOKENS = ['USDC', 'USDT', 'WETH', 'ARB', 'BTC', 'ETH'];
