import { describe, expect, it } from 'vitest';

import type { WalletBalance } from '../clients/onchainActions.js';

import { buildFundingTokenOptions } from './pendleFunding.js';

const balance = (params: {
  address: string;
  symbol?: string;
  decimals?: number;
  amount: string;
  valueUsd?: number;
}): WalletBalance => ({
  tokenUid: { chainId: '42161', address: params.address },
  amount: params.amount,
  symbol: params.symbol,
  decimals: params.decimals,
  valueUsd: params.valueUsd,
});

describe('buildFundingTokenOptions', () => {
  it('filters to whitelisted symbols and sorts by valueUsd desc', () => {
    const balances: WalletBalance[] = [
      balance({ address: '0x1', symbol: 'USDC', decimals: 6, amount: '100', valueUsd: 100 }),
      balance({ address: '0x2', symbol: 'USDai', decimals: 18, amount: '50', valueUsd: 75 }),
      balance({ address: '0x3', symbol: 'ETH', decimals: 18, amount: '1', valueUsd: 2500 }),
      balance({ address: '0x4', symbol: 'USDC', decimals: 6, amount: '200', valueUsd: 50 }),
    ];

    const options = buildFundingTokenOptions({
      balances,
      whitelistSymbols: ['USDC', 'USDai'],
    });

    expect(options.map((option) => option.symbol)).toEqual(['USDC', 'USDai', 'USDC']);
    expect(options[0]?.balance).toBe('100');
    expect(options[1]?.balance).toBe('50');
  });

  it('drops balances missing symbol or decimals', () => {
    const balances: WalletBalance[] = [
      balance({ address: '0x1', amount: '100', valueUsd: 100 }),
      balance({ address: '0x2', symbol: 'USDC', amount: '100', valueUsd: 100 }),
      balance({ address: '0x3', symbol: 'USDC', decimals: 6, amount: '100', valueUsd: 100 }),
    ];

    const options = buildFundingTokenOptions({
      balances,
      whitelistSymbols: ['USDC'],
    });

    expect(options).toHaveLength(1);
    expect(options[0]?.address).toBe('0x3');
  });

  it('breaks ties by symbol then address', () => {
    const balances: WalletBalance[] = [
      balance({ address: '0x2', symbol: 'USDT', decimals: 6, amount: '50', valueUsd: 10 }),
      balance({ address: '0x1', symbol: 'USDC', decimals: 6, amount: '50', valueUsd: 10 }),
      balance({ address: '0x0', symbol: 'USDC', decimals: 6, amount: '50', valueUsd: 10 }),
    ];

    const options = buildFundingTokenOptions({
      balances,
      whitelistSymbols: ['USDC', 'USDT'],
    });

    expect(options.map((option) => option.symbol)).toEqual(['USDC', 'USDC', 'USDT']);
    expect(options.map((option) => option.address)).toEqual(['0x0', '0x1', '0x2']);
  });
});
