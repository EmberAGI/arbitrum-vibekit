import { describe, expect, it } from 'vitest';

import {
  GetWalletLendingPositionsResponseSchema,
  LendTokenDetailSchema,
} from './lending.js';

describe('LendTokenDetailSchema', () => {
  it('retains reserve metadata and quote fields used for exact max-borrow resolution', () => {
    const parsed = LendTokenDetailSchema.parse({
      tokenUid: {
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        chainId: '42161',
      },
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      underlyingBalance: '0',
      underlyingBalanceUsd: '0',
      variableBorrows: '0',
      variableBorrowsUsd: '0',
      totalBorrows: '0',
      totalBorrowsUsd: '0',
      priceInUsd: '1',
      priceInMarketReferenceCurrency: '100000000',
      formattedPriceInMarketReferenceCurrency: '1',
      availableLiquidity: '1000000',
      availableLiquidityUsd: '1000000',
    });

    expect(parsed.symbol).toBe('USDC');
    expect(parsed.priceInUsd).toBe('1');
    expect(parsed.priceInMarketReferenceCurrency).toBe('100000000');
    expect(parsed.formattedPriceInMarketReferenceCurrency).toBe('1');
    expect(parsed.availableLiquidity).toBe('1000000');
    expect(parsed.availableLiquidityUsd).toBe('1000000');
  });
});

describe('GetWalletLendingPositionsResponseSchema', () => {
  it('retains an optional requestedReserve alongside aggregate lending fields', () => {
    const parsed = GetWalletLendingPositionsResponseSchema.parse({
      userReserves: [],
      requestedReserve: {
        tokenUid: {
          address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          chainId: '42161',
        },
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        underlyingBalance: '0',
        underlyingBalanceUsd: '0',
        variableBorrows: '0',
        variableBorrowsUsd: '0',
        totalBorrows: '0',
        totalBorrowsUsd: '0',
        priceInUsd: '1',
        priceInMarketReferenceCurrency: '100000000',
        formattedPriceInMarketReferenceCurrency: '1',
        availableLiquidity: '1000000',
        availableLiquidityUsd: '1000000',
      },
      totalLiquidityUsd: '10',
      totalCollateralUsd: '9',
      totalBorrowsUsd: '1',
      netWorthUsd: '8',
      availableBorrowsUsd: '5',
      currentLoanToValue: '0.1',
      currentLiquidationThreshold: '0.8',
      healthFactor: '5',
    });

    expect(parsed.requestedReserve?.priceInUsd).toBe('1');
    expect(parsed.availableBorrowsUsd).toBe('5');
  });
});
