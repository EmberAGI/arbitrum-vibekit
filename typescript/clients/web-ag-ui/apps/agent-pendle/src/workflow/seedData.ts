import type { PendleYieldToken } from '../domain/types.js';

import type { FundingTokenOption } from './context.js';

const USD_AI_ADDRESS = '0x1111111111111111111111111111111111111111' as const;
const RE_USD_ADDRESS = '0x2222222222222222222222222222222222222222' as const;
const NUSD_ADDRESS = '0x3333333333333333333333333333333333333333' as const;
const RUSD_ADDRESS = '0x4444444444444444444444444444444444444444' as const;
const YZ_USD_ADDRESS = '0x5555555555555555555555555555555555555555' as const;
const YS_USDC_ADDRESS = '0x6666666666666666666666666666666666666666' as const;
const UP_USDC_ADDRESS = '0x7777777777777777777777777777777777777777' as const;
const USD3_ADDRESS = '0x8888888888888888888888888888888888888888' as const;
const JR_USDE_ADDRESS = '0x9999999999999999999999999999999999999999' as const;
const IUSD_ADDRESS = '0x1010101010101010101010101010101010101010' as const;
const SYRUP_USDC_ADDRESS = '0x1212121212121212121212121212121212121212' as const;
const SYRUP_USDT_ADDRESS = '0x1313131313131313131313131313131313131313' as const;
const USDE_ADDRESS = '0x1414141414141414141414141414141414141414' as const;

export const YIELD_TOKENS: PendleYieldToken[] = [
  {
    marketAddress: '0xaaaa000000000000000000000000000000000001',
    ptAddress: '0xaaaa000000000000000000000000000000000101',
    ytAddress: '0xaaaa000000000000000000000000000000000201',
    ptSymbol: 'PT-USDe',
    ytSymbol: 'YT-USDe',
    underlyingSymbol: 'USDe',
    apy: 18.45,
    maturity: '2026-06-30',
  },
  {
    marketAddress: '0xaaaa000000000000000000000000000000000002',
    ptAddress: '0xaaaa000000000000000000000000000000000102',
    ytAddress: '0xaaaa000000000000000000000000000000000202',
    ptSymbol: 'PT-syrupUSDC',
    ytSymbol: 'YT-syrupUSDC',
    underlyingSymbol: 'syrupUSDC',
    apy: 15.2,
    maturity: '2026-03-31',
  },
  {
    marketAddress: '0xaaaa000000000000000000000000000000000003',
    ptAddress: '0xaaaa000000000000000000000000000000000103',
    ytAddress: '0xaaaa000000000000000000000000000000000203',
    ptSymbol: 'PT-USD3',
    ytSymbol: 'YT-USD3',
    underlyingSymbol: 'USD3',
    apy: 12.9,
    maturity: '2026-09-30',
  },
  {
    marketAddress: '0xaaaa000000000000000000000000000000000004',
    ptAddress: '0xaaaa000000000000000000000000000000000104',
    ytAddress: '0xaaaa000000000000000000000000000000000204',
    ptSymbol: 'PT-reUSD',
    ytSymbol: 'YT-reUSD',
    underlyingSymbol: 'reUSD',
    apy: 10.4,
    maturity: '2026-12-31',
  },
];

export const FUNDING_TOKENS: FundingTokenOption[] = [
  {
    address: USDE_ADDRESS,
    symbol: 'USDe',
    decimals: 18,
    balance: '2500000000000000000000',
  },
  {
    address: SYRUP_USDC_ADDRESS,
    symbol: 'syrupUSDC',
    decimals: 6,
    balance: '1750000000',
  },
  {
    address: SYRUP_USDT_ADDRESS,
    symbol: 'syrupUSDT',
    decimals: 6,
    balance: '1200000000',
  },
  {
    address: USD_AI_ADDRESS,
    symbol: 'USDai',
    decimals: 18,
    balance: '900000000000000000000',
  },
  {
    address: USD3_ADDRESS,
    symbol: 'USD3',
    decimals: 18,
    balance: '650000000000000000000',
  },
  {
    address: RE_USD_ADDRESS,
    symbol: 'reUSD',
    decimals: 18,
    balance: '480000000000000000000',
  },
  {
    address: NUSD_ADDRESS,
    symbol: 'NUSD',
    decimals: 18,
    balance: '350000000000000000000',
  },
  {
    address: RUSD_ADDRESS,
    symbol: 'rUSD',
    decimals: 18,
    balance: '280000000000000000000',
  },
  {
    address: YZ_USD_ADDRESS,
    symbol: 'yzUSD',
    decimals: 18,
    balance: '200000000000000000000',
  },
  {
    address: YS_USDC_ADDRESS,
    symbol: 'ysUSDC',
    decimals: 6,
    balance: '1550000000',
  },
  {
    address: UP_USDC_ADDRESS,
    symbol: 'upUSDC',
    decimals: 6,
    balance: '1100000000',
  },
  {
    address: JR_USDE_ADDRESS,
    symbol: 'jrUSDe',
    decimals: 18,
    balance: '160000000000000000000',
  },
  {
    address: IUSD_ADDRESS,
    symbol: 'iUSD',
    decimals: 18,
    balance: '140000000000000000000',
  },
];

export const STABLECOIN_WHITELIST = [
  'USDai',
  'sUSDai',
  'reUSD',
  'NUSD',
  'rUSD',
  'yzUSD',
  'ysUSDC',
  'upUSDC',
  'USD3',
  'jrUSDe',
  'iUSD',
  'syrupUSDC',
  'syrupUSDT',
  'USDe',
];
