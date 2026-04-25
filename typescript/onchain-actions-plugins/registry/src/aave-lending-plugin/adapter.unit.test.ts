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

describe('AAVEAdapter repay amount handling', () => {
  function createAdapter() {
    return new AAVEAdapter({
      chainId: 42161,
      rpcUrl: 'http://127.0.0.1:8545',
      wrappedNativeToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    });
  }

  const repayToken: Token = {
    tokenUid: {
      address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      chainId: '42161',
    },
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    isNative: false,
    isVetted: true,
    iconUri: null,
  };

  it('passes repay base-unit amounts without applying token decimals again', async () => {
    const adapter = createAdapter();
    const generateTxData = vi.fn().mockReturnValue({
      to: '0x0000000000000000000000000000000000000001',
      data: '0x',
      value: 0,
    });
    const createApproval = vi.fn().mockResolvedValue(null);

    Reflect.set(adapter, 'createApproval', createApproval);
    Reflect.set(
      adapter,
      'getPoolBundle',
      vi.fn().mockReturnValue({
        poolAddress: '0x0000000000000000000000000000000000000002',
        repayTxBuilder: { generateTxData },
      }),
    );

    await adapter.createRepayTransaction({
      repayToken,
      amount: 1000001n,
      walletAddress: '0x00000000000000000000000000000000000000f1',
    });

    expect(generateTxData).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '1000001',
      }),
    );
    expect(createApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_raw: '1000001',
      }),
    );
  });

  it('passes repay-with-aTokens base-unit amounts without applying token decimals again', async () => {
    const adapter = createAdapter();
    const generateTxData = vi.fn().mockReturnValue({
      to: '0x0000000000000000000000000000000000000001',
      data: '0x',
      value: 0,
    });

    Reflect.set(
      adapter,
      'getPoolBundle',
      vi.fn().mockReturnValue({
        repayWithATokensTxBuilder: { generateTxData },
      }),
    );

    await adapter.createRepayTransactionWithATokens({
      repayToken,
      amount: 1000001n,
      walletAddress: '0x00000000000000000000000000000000000000f1',
    });

    expect(generateTxData).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '1000001',
      }),
    );
  });
});

describe('AAVEAdapter.getUserSummary', () => {
  const walletAddress = '0xaD53eC51a70e9a17df6752fdA80cd465457c258d';

  function createAdapter() {
    return new AAVEAdapter({
      chainId: 42161,
      rpcUrl: 'http://127.0.0.1:8545',
      wrappedNativeToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    });
  }

  function mockUserSummary(adapter: AAVEAdapter) {
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
                symbol: 'WETH',
                name: 'Wrapped Ether',
                decimals: 18,
                priceInUSD: '2313.259876',
                priceInMarketReferenceCurrency: '231325987600',
                formattedPriceInMarketReferenceCurrency: '2313.259876',
                availableLiquidity: '100',
                availableLiquidityUSD: '231325.9876',
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
                symbol: 'WBTC',
                name: 'Wrapped BTC',
                decimals: 8,
                priceInUSD: '64985.320025',
                priceInMarketReferenceCurrency: '6498532002500',
                formattedPriceInMarketReferenceCurrency: '64985.320025',
                availableLiquidity: '0.35',
                availableLiquidityUSD: '22744.86200875',
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
                symbol: 'USDC',
                name: 'USD Coin',
                decimals: 6,
                priceInUSD: '1',
                priceInMarketReferenceCurrency: '100000000',
                formattedPriceInMarketReferenceCurrency: '1',
                availableLiquidity: '1000000',
                availableLiquidityUSD: '1000000',
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
        getReserveByUnderlyingAsset: vi.fn((tokenAddress: string) => {
          if (tokenAddress.toLowerCase() === '0xaf88d065e77c8cc2239327c5edb3a432268e5831') {
            return {
              underlyingAsset: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
              priceInUSD: '1',
              priceInMarketReferenceCurrency: '100000000',
              formattedPriceInMarketReferenceCurrency: '1',
              availableLiquidity: '1000000',
              availableLiquidityUSD: '1000000',
            };
          }
          return undefined;
        }),
      }),
    );
  }

  it('surfaces borrow-only reserves with reserve pricing and quote data', async () => {
    const adapter = createAdapter();
    mockUserSummary(adapter);

    const response = await adapter.getUserSummary({ walletAddress });

    expect(response.userReserves).toEqual([
      {
        tokenUid: {
          address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
          chainId: '42161',
        },
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        underlyingBalance: '0.020772004322653379',
        underlyingBalanceUsd: '48.06082327097565554490014',
        variableBorrows: '0',
        variableBorrowsUsd: '0',
        totalBorrows: '0',
        totalBorrowsUsd: '0',
        priceInUsd: '2313.259876',
        priceInMarketReferenceCurrency: '231325987600',
        formattedPriceInMarketReferenceCurrency: '2313.259876',
        availableLiquidity: '100',
        availableLiquidityUsd: '231325.9876',
      },
      {
        tokenUid: {
          address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
          chainId: '42161',
        },
        symbol: 'WBTC',
        name: 'Wrapped BTC',
        decimals: 8,
        underlyingBalance: '0',
        underlyingBalanceUsd: '0',
        variableBorrows: '0.00003175',
        variableBorrowsUsd: '2.0632659108276',
        totalBorrows: '0.00003175',
        totalBorrowsUsd: '2.0632659108276',
        priceInUsd: '64985.320025',
        priceInMarketReferenceCurrency: '6498532002500',
        formattedPriceInMarketReferenceCurrency: '64985.320025',
        availableLiquidity: '0.35',
        availableLiquidityUsd: '22744.86200875',
      },
    ]);
  });

  it('returns the requested reserve without injecting quote-only reserves into userReserves', async () => {
    const adapter = createAdapter();
    mockUserSummary(adapter);

    const response = await adapter.getUserSummary({
      walletAddress,
      tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    });

    expect(response.requestedReserve).toEqual({
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
    expect(response.userReserves).toHaveLength(2);
    expect(
      response.userReserves.some(
        ({ tokenUid }) =>
          tokenUid.address.toLowerCase() === '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      ),
    ).toBe(false);
  });

  it('does not duplicate an already surfaced reserve when tokenAddress casing differs', async () => {
    const adapter = createAdapter();
    Reflect.set(
      adapter,
      '_getUserSummary',
      vi.fn().mockResolvedValue({
        reserves: {
          totalLiquidityUSD: '1',
          totalCollateralUSD: '1',
          totalBorrowsUSD: '0',
          netWorthUSD: '1',
          availableBorrowsUSD: '0',
          currentLoanToValue: '0',
          currentLiquidationThreshold: '0',
          healthFactor: '1',
          userReservesData: [
            {
              reserve: {
                underlyingAsset: '0xAbCd000000000000000000000000000000000000',
                symbol: 'TEST',
                name: 'Test Token',
                decimals: 18,
                priceInUSD: '1',
                priceInMarketReferenceCurrency: '100000000',
                formattedPriceInMarketReferenceCurrency: '1',
                availableLiquidity: '10',
                availableLiquidityUSD: '10',
              },
              underlyingBalance: '1',
              underlyingBalanceUSD: '1',
              variableBorrows: '0',
              variableBorrowsUSD: '0',
              totalBorrows: '0',
              totalBorrowsUSD: '0',
            },
          ],
        },
        getReserveByUnderlyingAsset: vi.fn().mockReturnValue(undefined),
      }),
    );

    const response = await adapter.getUserSummary({
      walletAddress,
      tokenAddress: '0xabcd000000000000000000000000000000000000',
    });

    expect(response.requestedReserve?.tokenUid.address).toBe(
      '0xAbCd000000000000000000000000000000000000',
    );
    expect(response.userReserves).toHaveLength(1);
  });

  it('preserves aggregate lending fields when tokenAddress is used', async () => {
    const adapter = createAdapter();
    mockUserSummary(adapter);

    const response = await adapter.getUserSummary({
      walletAddress,
      tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    });

    expect(response.totalLiquidityUsd).toBe('58.36060178724453554490014');
    expect(response.totalCollateralUsd).toBe('56.29733587641693554490014');
    expect(response.totalBorrowsUsd).toBe('2.0632659108276');
    expect(response.netWorthUsd).toBe('54.23406996558933554490014');
    expect(response.availableBorrowsUsd).toBe('4.11411854325336000000000869546235081841162831848');
    expect(response.currentLoanToValue).toBe('0.10972782917545976573');
    expect(response.currentLiquidationThreshold).toBe('0.83122177366596321874');
    expect(response.healthFactor).toBe('22.68033952109134593808');
  });
});
