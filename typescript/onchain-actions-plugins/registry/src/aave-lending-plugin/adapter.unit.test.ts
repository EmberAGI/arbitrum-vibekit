import { describe, expect, it, vi } from 'vitest';

import type { Token } from '../core/index.js';

import { AAVEAdapter } from './adapter.js';

describe('AAVEAdapter.createWithdrawTransaction', () => {
  it('matches reserve underlyings case-insensitively and withdraws the underlying with a decimal amount', async () => {
    const adapter = new AAVEAdapter({
      chainId: 42161,
      rpcUrl: 'http://127.0.0.1:8545',
      wrappedNativeToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    });

    const withdraw = vi.fn().mockResolvedValue([
      {
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        value: 0,
      },
    ]);

    Reflect.set(
      adapter,
      'getReserves',
      vi.fn().mockResolvedValue({
        reservesData: [
          {
            underlyingAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
            aTokenAddress: '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8',
          },
        ],
      }),
    );
    Reflect.set(adapter, 'withdraw', withdraw);

    const walletAddress = '0x00000000000000000000000000000000000000f1';
    const tokenToWithdraw: Token = {
      tokenUid: {
        address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        chainId: '42161',
      },
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
      isNative: false,
      isVetted: true,
      iconUri: null,
    };

    const response = await adapter.createWithdrawTransaction({
      tokenToWithdraw,
      amount: 1n,
      walletAddress,
    });

    expect(withdraw).toHaveBeenCalledWith(
      '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      '0.000000000000000001',
      walletAddress,
      walletAddress,
    );
    expect(response.transactions).toHaveLength(1);
    expect(response.transactions[0]?.chainId).toBe('42161');
  });
});

describe('AAVEAdapter.getUserSummary', () => {
  it('keeps borrow-only reserves while still excluding zero-value reserve noise', async () => {
    const adapter = new AAVEAdapter({
      chainId: 42161,
      rpcUrl: 'http://127.0.0.1:8545',
      wrappedNativeToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    });

    Reflect.set(
      adapter,
      '_getUserSummary',
      vi.fn().mockResolvedValue({
        reserves: {
          totalLiquidityUSD: '58.36060178724453554490014',
          totalCollateralUSD: '56.29733587641693554490014',
          totalBorrowsUSD: '2.0632659108276',
          netWorthUSD: '54.23406996558933554490014',
          availableBorrowsUSD: '4.11411854325336000000000869546235081841162831848',
          currentLoanToValue: '0.10972782917545976573',
          currentLiquidationThreshold: '0.83122177366596321874',
          healthFactor: '22.68033952109134593808',
          userReservesData: [
            {
              reserve: {
                underlyingAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
              },
              underlyingBalance: '0.020772004322653379',
              underlyingBalanceUSD: '48.06082327097565554490014',
              variableBorrows: '0',
              variableBorrowsUSD: '0',
              totalBorrows: '0',
              totalBorrowsUSD: '0',
            },
            {
              reserve: {
                underlyingAsset: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
              },
              underlyingBalance: '0',
              underlyingBalanceUSD: '0',
              variableBorrows: '0.00003175',
              variableBorrowsUSD: '2.0632659108276',
              totalBorrows: '0.00003175',
              totalBorrowsUSD: '2.0632659108276',
            },
            {
              reserve: {
                underlyingAsset: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
              },
              underlyingBalance: '0',
              underlyingBalanceUSD: '0',
              variableBorrows: '0',
              variableBorrowsUSD: '0',
              totalBorrows: '0',
              totalBorrowsUSD: '0',
            },
          ],
        },
      }),
    );

    const response = await adapter.getUserSummary({
      walletAddress: '0xaD53eC51a70e9a17df6752fdA80cd465457c258d',
    });

    expect(response.userReserves).toEqual([
      {
        tokenUid: {
          address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
          chainId: '42161',
        },
        underlyingBalance: '0.020772004322653379',
        underlyingBalanceUsd: '48.06082327097565554490014',
        variableBorrows: '0',
        variableBorrowsUsd: '0',
        totalBorrows: '0',
        totalBorrowsUsd: '0',
      },
      {
        tokenUid: {
          address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
          chainId: '42161',
        },
        underlyingBalance: '0',
        underlyingBalanceUsd: '0',
        variableBorrows: '0.00003175',
        variableBorrowsUsd: '2.0632659108276',
        totalBorrows: '0.00003175',
        totalBorrowsUsd: '2.0632659108276',
      },
    ]);
    expect(response.totalBorrowsUsd).toBe('2.0632659108276');
  });
});
