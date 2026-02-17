import { describe, expect, it } from 'vitest';

import type { Token, TokenizedYieldMarket } from '../clients/onchainActions.js';
import type { PendleYieldToken } from '../domain/types.js';

import { buildEligibleYieldTokens } from './pendleMarkets.js';

const token = (params: {
  address: string;
  symbol: string;
  chainId?: string;
  name?: string;
}): Token => ({
  tokenUid: { chainId: params.chainId ?? '42161', address: params.address },
  name: params.name ?? params.symbol,
  symbol: params.symbol,
  isNative: false,
  decimals: 18,
  isVetted: true,
});

const market = (params: {
  address: string;
  ytSymbol: string;
  underlying: Token;
  apy?: string;
}): TokenizedYieldMarket => ({
  marketIdentifier: { chainId: params.underlying.tokenUid.chainId, address: params.address },
  expiry: '2030-01-01',
  details: params.apy ? { aggregatedApy: params.apy } : {},
  ptToken: token({ address: '0xpt', symbol: `PT-${params.underlying.symbol}` }),
  ytToken: token({ address: '0xyt', symbol: params.ytSymbol }),
  underlyingToken: params.underlying,
});

const whitelist = ['USDai', 'USDC'];

const toSummary = (tokens: PendleYieldToken[]) =>
  tokens.map((entry) => `${entry.ytSymbol}:${entry.apy}:${entry.marketAddress}`);

describe('buildEligibleYieldTokens', () => {
  it('filters by whitelist and swap support, then ranks by apy', () => {
    const supported = [
      token({ address: '0xusdai', symbol: 'USDai' }),
      token({ address: '0xusdc', symbol: 'USDC' }),
    ];

    const markets = [
      market({
        address: '0xmarket1',
        ytSymbol: 'YT-USDai-2024',
        underlying: token({ address: '0xusdai', symbol: 'USDai' }),
        apy: '7.25',
      }),
      market({
        address: '0xmarket2',
        ytSymbol: 'YT-USDC-2024',
        underlying: token({ address: '0xusdc', symbol: 'USDC' }),
        apy: '6.1',
      }),
      market({
        address: '0xmarket3',
        ytSymbol: 'YT-FOO-2024',
        underlying: token({ address: '0xfoo', symbol: 'FOO' }),
        apy: '9.0',
      }),
      market({
        address: '0xmarket4',
        ytSymbol: 'YT-USDai-2025',
        underlying: token({ address: '0xusdai2', symbol: 'USDai' }),
        apy: '8.0',
      }),
    ];

    const eligible = buildEligibleYieldTokens({
      markets,
      supportedTokens: supported,
      whitelistSymbols: whitelist,
    });

    expect(toSummary(eligible)).toEqual([
      'YT-USDai-2024:7.25:0xmarket1',
      'YT-USDC-2024:6.1:0xmarket2',
    ]);
  });
});
