import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnchainClients } from '../clients/clients.js';
import type {
  OnchainActionsClient,
  TokenizedYieldMarket,
  TokenizedYieldPosition,
} from '../clients/onchainActions.js';

import {
  executeCompound,
  executeInitialDeposit,
  executeRebalance,
  executeRollover,
  executeUnwind,
} from './execution.js';

const { executeTransactionMock, redeemDelegationsAndExecuteTransactionsMock } = vi.hoisted(() => ({
  executeTransactionMock: vi.fn(),
  redeemDelegationsAndExecuteTransactionsMock: vi.fn(),
}));

vi.mock('../core/transaction.js', () => ({
  executeTransaction: executeTransactionMock,
}));

vi.mock('../core/delegatedExecution.js', () => ({
  redeemDelegationsAndExecuteTransactions: redeemDelegationsAndExecuteTransactionsMock,
}));

describe('executeRebalance', () => {
  beforeEach(() => {
    executeTransactionMock.mockReset();
    redeemDelegationsAndExecuteTransactionsMock.mockReset();
  });
  it('sells current PT and buys new PT using the sell output token in order', async () => {
    const onchainActionsClient: Pick<
      OnchainActionsClient,
      'createTokenizedYieldSellPt' | 'createTokenizedYieldBuyPt'
    > = {
      createTokenizedYieldSellPt: vi.fn().mockResolvedValue({
        exactAmountOut: '1000',
        tokenOut: {
          tokenUid: { chainId: '42161', address: '0xold-underlying' },
          name: 'USDai',
          symbol: 'USDai',
          isNative: false,
          decimals: 18,
          iconUri: undefined,
          isVetted: true,
        },
        transactions: [
          { type: 'EVM_TX', to: '0xsell', data: '0x01', value: '0', chainId: '42161' },
        ],
      }),
      createTokenizedYieldBuyPt: vi.fn().mockResolvedValue({
        transactions: [
          { type: 'EVM_TX', to: '0xbuy', data: '0x02', value: '0', chainId: '42161' },
        ],
      }),
    };

    executeTransactionMock
      .mockResolvedValueOnce({ transactionHash: '0xsellhash' })
      .mockResolvedValueOnce({ transactionHash: '0xbuyhash' });

    const clients = {} as OnchainClients;

    const currentMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-old' },
      expiry: '2030-01-01',
      details: {},
      ptToken: {
        tokenUid: { chainId: '42161', address: '0xpt-old' },
        name: 'PT-OLD',
        symbol: 'PT-OLD',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      ytToken: {
        tokenUid: { chainId: '42161', address: '0xyt-old' },
        name: 'YT-OLD',
        symbol: 'YT-OLD',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      underlyingToken: {
        tokenUid: { chainId: '42161', address: '0xold-underlying' },
        name: 'USDai',
        symbol: 'USDai',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
    };

    const targetMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-new' },
      expiry: '2030-01-01',
      details: {},
      ptToken: {
        tokenUid: { chainId: '42161', address: '0xpt-new' },
        name: 'PT-NEW',
        symbol: 'PT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      ytToken: {
        tokenUid: { chainId: '42161', address: '0xyt-new' },
        name: 'YT-NEW',
        symbol: 'YT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      underlyingToken: {
        tokenUid: { chainId: '42161', address: '0xnew-underlying' },
        name: 'USDC',
        symbol: 'USDC',
        isNative: false,
        decimals: 6,
        iconUri: undefined,
        isVetted: true,
      },
    };

    const position: TokenizedYieldPosition = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-old' },
      pt: {
        token: {
          tokenUid: { chainId: '42161', address: '0xpt-old' },
          name: 'PT-OLD',
          symbol: 'PT-OLD',
          isNative: false,
          decimals: 18,
          iconUri: undefined,
          isVetted: true,
        },
        exactAmount: '1000',
      },
      yt: {
        token: {
          tokenUid: { chainId: '42161', address: '0xyt-old' },
          name: 'YT-OLD',
          symbol: 'YT-OLD',
          isNative: false,
          decimals: 18,
          iconUri: undefined,
          isVetted: true,
        },
        exactAmount: '25',
        claimableRewards: [],
      },
    };

    const result = await executeRebalance({
      onchainActionsClient,
      clients,
      txExecutionMode: 'execute',
      walletAddress: '0x0000000000000000000000000000000000000001',
      position,
      currentMarket,
      targetMarket,
    });

    expect(onchainActionsClient.createTokenizedYieldSellPt).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      ptTokenUid: position.pt.token.tokenUid,
      amount: '1000',
      slippage: '0.01',
    });
    expect(onchainActionsClient.createTokenizedYieldBuyPt).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      marketAddress: targetMarket.marketIdentifier.address,
      inputTokenUid: currentMarket.underlyingToken.tokenUid,
      amount: '1000',
      slippage: '0.01',
    });

    expect(executeTransactionMock).toHaveBeenCalledTimes(2);
    expect(executeTransactionMock.mock.calls[0]?.[1]).toMatchObject({ to: '0xsell' });
    expect(executeTransactionMock.mock.calls[1]?.[1]).toMatchObject({ to: '0xbuy' });
    expect(result.lastTxHash).toBe('0xbuyhash');
  });
});

describe('executeUnwind', () => {
  beforeEach(() => {
    executeTransactionMock.mockReset();
    redeemDelegationsAndExecuteTransactionsMock.mockReset();
  });

  it('returns empty metadata when there are no positions to unwind', async () => {
    const onchainActionsClient = {
      listTokenizedYieldMarkets: vi.fn().mockResolvedValue([]),
      listTokenizedYieldPositions: vi.fn().mockResolvedValue([]),
      createTokenizedYieldClaimRewards: vi.fn(),
      createTokenizedYieldRedeemPt: vi.fn(),
      createTokenizedYieldSellPt: vi.fn(),
    };

    const result = await executeUnwind({
      onchainActionsClient,
      txExecutionMode: 'plan',
      walletAddress: '0x0000000000000000000000000000000000000001',
      chainIds: ['42161'],
    });

    expect(result).toEqual({
      txHashes: [],
      positionCount: 0,
      transactionCount: 0,
    });
    expect(onchainActionsClient.createTokenizedYieldClaimRewards).not.toHaveBeenCalled();
    expect(onchainActionsClient.createTokenizedYieldRedeemPt).not.toHaveBeenCalled();
    expect(onchainActionsClient.createTokenizedYieldSellPt).not.toHaveBeenCalled();
  });

  it('retries position lookup and proceeds when a position appears on a subsequent attempt', async () => {
    const onchainActionsClient = {
      listTokenizedYieldMarkets: vi.fn().mockResolvedValue([
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket' },
          expiry: '2999-01-01',
          details: {},
          ptToken: {
            tokenUid: { chainId: '42161', address: '0xpt' },
            name: 'PT',
            symbol: 'PT',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
          ytToken: {
            tokenUid: { chainId: '42161', address: '0xyt' },
            name: 'YT',
            symbol: 'YT',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
          underlyingToken: {
            tokenUid: { chainId: '42161', address: '0xunderlying' },
            name: 'USDai',
            symbol: 'USDai',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
        },
      ]),
      listTokenizedYieldPositions: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            marketIdentifier: { chainId: '42161', address: '0xmarket' },
            pt: {
              token: {
                tokenUid: { chainId: '42161', address: '0xpt' },
                name: 'PT',
                symbol: 'PT',
                isNative: false,
                decimals: 18,
                iconUri: undefined,
                isVetted: true,
              },
              exactAmount: '0',
            },
            yt: {
              token: {
                tokenUid: { chainId: '42161', address: '0xyt' },
                name: 'YT',
                symbol: 'YT',
                isNative: false,
                decimals: 18,
                iconUri: undefined,
                isVetted: true,
              },
              exactAmount: '0',
              claimableRewards: [],
            },
          },
        ]),
      createTokenizedYieldClaimRewards: vi.fn(),
      createTokenizedYieldRedeemPt: vi.fn(),
      createTokenizedYieldSellPt: vi.fn(),
    };

    const result = await executeUnwind({
      onchainActionsClient,
      txExecutionMode: 'plan',
      walletAddress: '0x0000000000000000000000000000000000000001',
      chainIds: ['42161'],
      positionLookupAttempts: 3,
      positionLookupDelayMs: 0,
    });

    expect(onchainActionsClient.listTokenizedYieldPositions).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      txHashes: [],
      positionCount: 1,
      transactionCount: 0,
    });
  });

  it('retries planning a claim step up to 2 times before succeeding', async () => {
    const onchainActionsClient = {
      listTokenizedYieldMarkets: vi.fn().mockResolvedValue([]),
      listTokenizedYieldPositions: vi.fn().mockResolvedValue([
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket' },
          pt: {
            token: {
              tokenUid: { chainId: '42161', address: '0xpt' },
              name: 'PT',
              symbol: 'PT',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '0',
          },
          yt: {
            token: {
              tokenUid: { chainId: '42161', address: '0xyt' },
              name: 'YT',
              symbol: 'YT',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '0',
            claimableRewards: [
              {
                token: {
                  tokenUid: { chainId: '42161', address: '0xreward' },
                  name: 'REWARD',
                  symbol: 'REWARD',
                  isNative: false,
                  decimals: 18,
                  iconUri: undefined,
                  isVetted: true,
                },
                exactAmount: '1',
              },
            ],
          },
        },
      ]),
      createTokenizedYieldClaimRewards: vi
        .fn()
        .mockRejectedValueOnce(new Error('claim-1'))
        .mockRejectedValueOnce(new Error('claim-2'))
        .mockResolvedValue({
          transactions: [
            { type: 'EVM_TX', to: '0xclaim', data: '0x01', value: '0', chainId: '42161' },
          ],
        }),
      createTokenizedYieldRedeemPt: vi.fn(),
      createTokenizedYieldSellPt: vi.fn(),
    };

    const result = await executeUnwind({
      onchainActionsClient,
      txExecutionMode: 'plan',
      walletAddress: '0x0000000000000000000000000000000000000001',
      maxRetries: 2,
    });

    expect(onchainActionsClient.createTokenizedYieldClaimRewards).toHaveBeenCalledTimes(3);
    expect(result.positionCount).toBe(1);
    expect(result.transactionCount).toBe(1);
    expect(result.txHashes).toEqual([]);
  });

  it('retries a failing transaction up to 2 times before succeeding', async () => {
    executeTransactionMock
      .mockRejectedValueOnce(new Error('tx-1'))
      .mockRejectedValueOnce(new Error('tx-2'))
      .mockResolvedValueOnce({ transactionHash: '0xhash' });

    const onchainActionsClient = {
      listTokenizedYieldMarkets: vi.fn().mockResolvedValue([
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket' },
          expiry: '2999-01-01',
          details: {},
          ptToken: {
            tokenUid: { chainId: '42161', address: '0xpt' },
            name: 'PT',
            symbol: 'PT',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
          ytToken: {
            tokenUid: { chainId: '42161', address: '0xyt' },
            name: 'YT',
            symbol: 'YT',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
          underlyingToken: {
            tokenUid: { chainId: '42161', address: '0xunderlying' },
            name: 'USDai',
            symbol: 'USDai',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
        },
      ]),
      listTokenizedYieldPositions: vi.fn().mockResolvedValue([
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket' },
          pt: {
            token: {
              tokenUid: { chainId: '42161', address: '0xpt' },
              name: 'PT',
              symbol: 'PT',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '10',
          },
          yt: {
            token: {
              tokenUid: { chainId: '42161', address: '0xyt' },
              name: 'YT',
              symbol: 'YT',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '0',
            claimableRewards: [],
          },
        },
      ]),
      createTokenizedYieldClaimRewards: vi.fn(),
      createTokenizedYieldRedeemPt: vi.fn(),
      createTokenizedYieldSellPt: vi.fn().mockResolvedValue({
        exactAmountOut: '10',
        tokenOut: {
          tokenUid: { chainId: '42161', address: '0xunderlying' },
          name: 'USDai',
          symbol: 'USDai',
          isNative: false,
          decimals: 18,
          iconUri: undefined,
          isVetted: true,
        },
        transactions: [
          { type: 'EVM_TX', to: '0xsell', data: '0x01', value: '0', chainId: '42161' },
        ],
      }),
    };

    const clients = {} as OnchainClients;

    const result = await executeUnwind({
      onchainActionsClient,
      txExecutionMode: 'execute',
      clients,
      walletAddress: '0x0000000000000000000000000000000000000001',
      maxRetries: 2,
    });

    expect(executeTransactionMock).toHaveBeenCalledTimes(3);
    expect(result.txHashes).toEqual(['0xhash']);
    expect(result.transactionCount).toBe(1);
  });

  it('claims rewards then exits each position, redeeming matured PT and selling non-matured PT', async () => {
    const nowMs = Date.parse('2026-02-09T00:00:00.000Z');

    const createTokenizedYieldClaimRewardsMock = vi.fn().mockResolvedValue({
      transactions: [{ type: 'EVM_TX', to: '0xclaim', data: '0x01', value: '0', chainId: '42161' }],
    });
    const createTokenizedYieldRedeemPtMock = vi.fn().mockResolvedValue({
      exactUnderlyingAmount: '10',
      underlyingTokenIdentifier: { chainId: '42161', address: '0xunderlying' },
      transactions: [{ type: 'EVM_TX', to: '0xredeem', data: '0x02', value: '0', chainId: '42161' }],
    });
    const createTokenizedYieldSellPtMock = vi.fn().mockResolvedValue({
      exactAmountOut: '10',
      tokenOut: {
        tokenUid: { chainId: '42161', address: '0xunderlying' },
        name: 'USDai',
        symbol: 'USDai',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      transactions: [{ type: 'EVM_TX', to: '0xsell', data: '0x03', value: '0', chainId: '42161' }],
    });

    const onchainActionsClient: Pick<
      OnchainActionsClient,
      | 'listTokenizedYieldMarkets'
      | 'listTokenizedYieldPositions'
      | 'createTokenizedYieldClaimRewards'
      | 'createTokenizedYieldRedeemPt'
      | 'createTokenizedYieldSellPt'
    > = {
      listTokenizedYieldMarkets: vi.fn().mockResolvedValue([
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket-matured' },
          expiry: '2000-01-01',
          details: {},
          ptToken: {
            tokenUid: { chainId: '42161', address: '0xpt-matured' },
            name: 'PT-MATURED',
            symbol: 'PT-MATURED',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
          ytToken: {
            tokenUid: { chainId: '42161', address: '0xyt-matured' },
            name: 'YT-MATURED',
            symbol: 'YT-MATURED',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
          underlyingToken: {
            tokenUid: { chainId: '42161', address: '0xunderlying' },
            name: 'USDai',
            symbol: 'USDai',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
        },
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket-live' },
          expiry: '2999-01-01',
          details: {},
          ptToken: {
            tokenUid: { chainId: '42161', address: '0xpt-live' },
            name: 'PT-LIVE',
            symbol: 'PT-LIVE',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
          ytToken: {
            tokenUid: { chainId: '42161', address: '0xyt-live' },
            name: 'YT-LIVE',
            symbol: 'YT-LIVE',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
          underlyingToken: {
            tokenUid: { chainId: '42161', address: '0xunderlying' },
            name: 'USDai',
            symbol: 'USDai',
            isNative: false,
            decimals: 18,
            iconUri: undefined,
            isVetted: true,
          },
        },
      ]),
      listTokenizedYieldPositions: vi.fn().mockResolvedValue([
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket-matured' },
          pt: {
            token: {
              tokenUid: { chainId: '42161', address: '0xpt-matured' },
              name: 'PT-MATURED',
              symbol: 'PT-MATURED',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '100',
          },
          yt: {
            token: {
              tokenUid: { chainId: '42161', address: '0xyt-matured' },
              name: 'YT-MATURED',
              symbol: 'YT-MATURED',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '0',
            claimableRewards: [
              {
                token: {
                  tokenUid: { chainId: '42161', address: '0xreward' },
                  name: 'PENDLE',
                  symbol: 'PENDLE',
                  isNative: false,
                  decimals: 18,
                  iconUri: undefined,
                  isVetted: true,
                },
                exactAmount: '1',
              },
            ],
          },
        },
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket-live' },
          pt: {
            token: {
              tokenUid: { chainId: '42161', address: '0xpt-live' },
              name: 'PT-LIVE',
              symbol: 'PT-LIVE',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '200',
          },
          yt: {
            token: {
              tokenUid: { chainId: '42161', address: '0xyt-live' },
              name: 'YT-LIVE',
              symbol: 'YT-LIVE',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '0',
            claimableRewards: [
              {
                token: {
                  tokenUid: { chainId: '42161', address: '0xreward' },
                  name: 'PENDLE',
                  symbol: 'PENDLE',
                  isNative: false,
                  decimals: 18,
                  iconUri: undefined,
                  isVetted: true,
                },
                exactAmount: '2',
              },
            ],
          },
        },
      ]),
      createTokenizedYieldClaimRewards: createTokenizedYieldClaimRewardsMock,
      createTokenizedYieldRedeemPt: createTokenizedYieldRedeemPtMock,
      createTokenizedYieldSellPt: createTokenizedYieldSellPtMock,
    };

    const result = await executeUnwind({
      onchainActionsClient,
      txExecutionMode: 'plan',
      walletAddress: '0x0000000000000000000000000000000000000001',
      nowMs,
    });

    expect(result.txHashes).toEqual([]);
    expect(result.positionCount).toBe(2);
    expect(result.transactionCount).toBe(4);

    expect(createTokenizedYieldClaimRewardsMock).toHaveBeenCalledTimes(2);
    expect(createTokenizedYieldRedeemPtMock).toHaveBeenCalledTimes(1);
    expect(createTokenizedYieldSellPtMock).toHaveBeenCalledTimes(1);

    const claimOrder = createTokenizedYieldClaimRewardsMock.mock.invocationCallOrder;
    const redeemOrder = createTokenizedYieldRedeemPtMock.mock.invocationCallOrder;
    const sellOrder = createTokenizedYieldSellPtMock.mock.invocationCallOrder;

    const firstRedeem = redeemOrder[0];
    const firstSell = sellOrder[0];
    if (typeof firstRedeem !== 'number' || typeof firstSell !== 'number') {
      throw new Error('Expected unwind to redeem/sell at least once');
    }
    expect(claimOrder[0]).toBeLessThan(firstRedeem);
    expect(claimOrder[1]).toBeLessThan(firstSell);
  });
});

describe('executeInitialDeposit', () => {
  beforeEach(() => {
    executeTransactionMock.mockReset();
    redeemDelegationsAndExecuteTransactionsMock.mockReset();
  });
  it('buys PT using the selected funding token directly', async () => {
    const onchainActionsClient: Pick<OnchainActionsClient, 'createTokenizedYieldBuyPt'> = {
      createTokenizedYieldBuyPt: vi.fn().mockResolvedValue({
        transactions: [
          { type: 'EVM_TX', to: '0xbuy', data: '0x04', value: '0', chainId: '42161' },
        ],
      }),
    };

    executeTransactionMock.mockResolvedValueOnce({ transactionHash: '0xbuyhash' });

    const clients = {} as OnchainClients;

    const fundingToken = {
      tokenUid: { chainId: '42161', address: '0xusdc' },
      name: 'USDC',
      symbol: 'USDC',
      isNative: false,
      decimals: 6,
      iconUri: undefined,
      isVetted: true,
    };

    const targetMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-new' },
      expiry: '2030-01-01',
      details: {},
      ptToken: {
        tokenUid: { chainId: '42161', address: '0xpt-new' },
        name: 'PT-NEW',
        symbol: 'PT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      ytToken: {
        tokenUid: { chainId: '42161', address: '0xyt-new' },
        name: 'YT-NEW',
        symbol: 'YT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      underlyingToken: {
        tokenUid: { chainId: '42161', address: '0xusdai' },
        name: 'USDai',
        symbol: 'USDai',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
    };

    const result = await executeInitialDeposit({
      onchainActionsClient,
      clients,
      txExecutionMode: 'execute',
      walletAddress: '0x0000000000000000000000000000000000000001',
      fundingToken,
      targetMarket,
      fundingAmount: '10000000',
    });

    expect(onchainActionsClient.createTokenizedYieldBuyPt).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      marketAddress: targetMarket.marketIdentifier.address,
      inputTokenUid: fundingToken.tokenUid,
      amount: '10000000',
      slippage: '0.01',
    });
    expect(executeTransactionMock).toHaveBeenCalledTimes(1);
    expect(executeTransactionMock.mock.calls[0]?.[1]).toMatchObject({ to: '0xbuy' });
    expect(result.lastTxHash).toBe('0xbuyhash');
  });

  it('executes via delegated execution when a delegation bundle is provided', async () => {
    const onchainActionsClient: Pick<OnchainActionsClient, 'createTokenizedYieldBuyPt'> = {
      createTokenizedYieldBuyPt: vi.fn().mockResolvedValue({
        transactions: [{ type: 'EVM_TX', to: '0xbuy', data: '0x04', value: '0', chainId: '42161' }],
      }),
    };

    executeTransactionMock.mockResolvedValueOnce({ transactionHash: '0xshould-not-submit' });

    redeemDelegationsAndExecuteTransactionsMock.mockResolvedValueOnce({
      txHashes: ['0xdelegated'],
      receipts: [],
    });

    const clients = {} as OnchainClients;

    const fundingToken = {
      tokenUid: { chainId: '42161', address: '0xusdc' },
      name: 'USDC',
      symbol: 'USDC',
      isNative: false,
      decimals: 6,
      iconUri: undefined,
      isVetted: true,
    };

    const targetMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-new' },
      expiry: '2030-01-01',
      details: {},
      ptToken: {
        tokenUid: { chainId: '42161', address: '0xpt-new' },
        name: 'PT-NEW',
        symbol: 'PT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      ytToken: {
        tokenUid: { chainId: '42161', address: '0xyt-new' },
        name: 'YT-NEW',
        symbol: 'YT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      underlyingToken: {
        tokenUid: { chainId: '42161', address: '0xusdai' },
        name: 'USDai',
        symbol: 'USDai',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
    };

    const delegationBundle = {
      chainId: 42161,
      delegationManager: '0x000000000000000000000000000000000000dead',
      delegatorAddress: '0x0000000000000000000000000000000000000001',
      delegateeAddress: '0x0000000000000000000000000000000000000002',
      delegations: [
        {
          delegate: '0x0000000000000000000000000000000000000002',
          delegator: '0x0000000000000000000000000000000000000001',
          authority: `0x${'0'.repeat(64)}`,
          caveats: [],
          salt: `0x${'1'.repeat(64)}`,
          signature: '0xsignature',
        },
      ],
      intents: [
        {
          target: '0x000000000000000000000000000000000000beef',
          selector: '0x095ea7b3',
          allowedCalldata: [],
        },
      ],
      descriptions: ['approve and execute'],
      warnings: [],
    };

    const result = await executeInitialDeposit({
      onchainActionsClient,
      clients,
      txExecutionMode: 'execute',
      walletAddress: '0x0000000000000000000000000000000000000001',
      fundingToken,
      targetMarket,
      fundingAmount: '10000000',
      delegationBundle,
    });

    expect(redeemDelegationsAndExecuteTransactionsMock).toHaveBeenCalledTimes(1);
    expect(executeTransactionMock).not.toHaveBeenCalled();
    expect(result.txHashes).toEqual(['0xdelegated']);
  });

  it('builds a plan but does not submit when tx execution mode is plan', async () => {
    const onchainActionsClient: Pick<OnchainActionsClient, 'createTokenizedYieldBuyPt'> = {
      createTokenizedYieldBuyPt: vi.fn().mockResolvedValue({
        transactions: [
          { type: 'EVM_TX', to: '0xbuy', data: '0x05', value: '0', chainId: '42161' },
        ],
      }),
    };

    const clients = {} as OnchainClients;

    const fundingToken = {
      tokenUid: { chainId: '42161', address: '0xusdc' },
      name: 'USDC',
      symbol: 'USDC',
      isNative: false,
      decimals: 6,
      iconUri: undefined,
      isVetted: true,
    };

    const targetMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-new' },
      expiry: '2030-01-01',
      details: {},
      ptToken: {
        tokenUid: { chainId: '42161', address: '0xpt-new' },
        name: 'PT-NEW',
        symbol: 'PT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      ytToken: {
        tokenUid: { chainId: '42161', address: '0xyt-new' },
        name: 'YT-NEW',
        symbol: 'YT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      underlyingToken: {
        tokenUid: { chainId: '42161', address: '0xusdai' },
        name: 'USDai',
        symbol: 'USDai',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
    };

    const result = await executeInitialDeposit({
      onchainActionsClient,
      clients,
      txExecutionMode: 'plan',
      walletAddress: '0x0000000000000000000000000000000000000001',
      fundingToken,
      targetMarket,
      fundingAmount: '10000000',
    });

    expect(onchainActionsClient.createTokenizedYieldBuyPt).toHaveBeenCalledTimes(1);
    expect(executeTransactionMock).not.toHaveBeenCalled();
    expect(result.txHashes).toEqual([]);
    expect(result.lastTxHash).toBeUndefined();
  });
});

describe('executeRollover', () => {
  beforeEach(() => {
    executeTransactionMock.mockReset();
  });
  it('redeems PT at maturity and buys new PT using the redeemed output token', async () => {
    const onchainActionsClient: Pick<
      OnchainActionsClient,
      'createTokenizedYieldRedeemPt' | 'createTokenizedYieldBuyPt'
    > = {
      createTokenizedYieldRedeemPt: vi.fn().mockResolvedValue({
        exactAmountOut: '1200',
        tokenOut: {
          tokenUid: { chainId: '42161', address: '0xold-underlying' },
          name: 'USDai',
          symbol: 'USDai',
          isNative: false,
          decimals: 18,
          iconUri: undefined,
          isVetted: true,
        },
        transactions: [
          { type: 'EVM_TX', to: '0xredeem', data: '0x10', value: '0', chainId: '42161' },
        ],
      }),
      createTokenizedYieldBuyPt: vi.fn().mockResolvedValue({
        transactions: [
          { type: 'EVM_TX', to: '0xbuy', data: '0x11', value: '0', chainId: '42161' },
        ],
      }),
    };

    executeTransactionMock
      .mockResolvedValueOnce({ transactionHash: '0xredeemhash' })
      .mockResolvedValueOnce({ transactionHash: '0xbuyhash' });

    const clients = {} as OnchainClients;

    const currentMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-old' },
      expiry: '2024-01-01',
      details: {},
      ptToken: {
        tokenUid: { chainId: '42161', address: '0xpt-old' },
        name: 'PT-OLD',
        symbol: 'PT-OLD',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      ytToken: {
        tokenUid: { chainId: '42161', address: '0xyt-old' },
        name: 'YT-OLD',
        symbol: 'YT-OLD',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      underlyingToken: {
        tokenUid: { chainId: '42161', address: '0xold-underlying' },
        name: 'USDai',
        symbol: 'USDai',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
    };

    const targetMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-new' },
      expiry: '2030-01-01',
      details: {},
      ptToken: {
        tokenUid: { chainId: '42161', address: '0xpt-new' },
        name: 'PT-NEW',
        symbol: 'PT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      ytToken: {
        tokenUid: { chainId: '42161', address: '0xyt-new' },
        name: 'YT-NEW',
        symbol: 'YT-NEW',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      underlyingToken: {
        tokenUid: { chainId: '42161', address: '0xnew-underlying' },
        name: 'USDC',
        symbol: 'USDC',
        isNative: false,
        decimals: 6,
        iconUri: undefined,
        isVetted: true,
      },
    };

    const position: TokenizedYieldPosition = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-old' },
      pt: {
        token: {
          tokenUid: { chainId: '42161', address: '0xpt-old' },
          name: 'PT-OLD',
          symbol: 'PT-OLD',
          isNative: false,
          decimals: 18,
          iconUri: undefined,
          isVetted: true,
        },
        exactAmount: '1200',
      },
      yt: {
        token: {
          tokenUid: { chainId: '42161', address: '0xyt-old' },
          name: 'YT-OLD',
          symbol: 'YT-OLD',
          isNative: false,
          decimals: 18,
          iconUri: undefined,
          isVetted: true,
        },
        exactAmount: '0',
        claimableRewards: [],
      },
    };

    const result = await executeRollover({
      onchainActionsClient,
      clients,
      txExecutionMode: 'execute',
      walletAddress: '0x0000000000000000000000000000000000000001',
      position,
      currentMarket,
      targetMarket,
    });

    expect(onchainActionsClient.createTokenizedYieldRedeemPt).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      ptTokenUid: position.pt.token.tokenUid,
      amount: '1200',
    });
    expect(onchainActionsClient.createTokenizedYieldBuyPt).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      marketAddress: targetMarket.marketIdentifier.address,
      inputTokenUid: currentMarket.underlyingToken.tokenUid,
      amount: '1200',
      slippage: '0.01',
    });

    expect(executeTransactionMock).toHaveBeenCalledTimes(2);
    expect(executeTransactionMock.mock.calls[0]?.[1]).toMatchObject({ to: '0xredeem' });
    expect(executeTransactionMock.mock.calls[1]?.[1]).toMatchObject({ to: '0xbuy' });
    expect(result.lastTxHash).toBe('0xbuyhash');
  });
});

describe('executeCompound', () => {
  beforeEach(() => {
    executeTransactionMock.mockReset();
  });
  it('claims rewards, swaps non-underlying rewards, and buys more PT', async () => {
    const onchainActionsClient: Pick<
      OnchainActionsClient,
      'createTokenizedYieldClaimRewards' | 'createSwap' | 'createTokenizedYieldBuyPt'
    > = {
      createTokenizedYieldClaimRewards: vi.fn().mockResolvedValue({
        transactions: [
          { type: 'EVM_TX', to: '0xclaim', data: '0x20', value: '0', chainId: '42161' },
        ],
      }),
      createSwap: vi.fn().mockResolvedValue({
        exactFromAmount: '500',
        exactToAmount: '495',
        transactions: [
          { type: 'EVM_TX', to: '0xswap', data: '0x21', value: '0', chainId: '42161' },
        ],
      }),
      createTokenizedYieldBuyPt: vi.fn().mockResolvedValue({
        transactions: [
          { type: 'EVM_TX', to: '0xbuy', data: '0x22', value: '0', chainId: '42161' },
        ],
      }),
    };

    executeTransactionMock
      .mockResolvedValueOnce({ transactionHash: '0xclaimhash' })
      .mockResolvedValueOnce({ transactionHash: '0xswaphash' })
      .mockResolvedValueOnce({ transactionHash: '0xbuyhash' });

    const clients = {} as OnchainClients;

    const currentMarket: TokenizedYieldMarket = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
      expiry: '2030-01-01',
      details: {},
      ptToken: {
        tokenUid: { chainId: '42161', address: '0xpt-current' },
        name: 'PT-CURRENT',
        symbol: 'PT-CURRENT',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      ytToken: {
        tokenUid: { chainId: '42161', address: '0xyt-current' },
        name: 'YT-CURRENT',
        symbol: 'YT-CURRENT',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
      underlyingToken: {
        tokenUid: { chainId: '42161', address: '0xunderlying' },
        name: 'USDai',
        symbol: 'USDai',
        isNative: false,
        decimals: 18,
        iconUri: undefined,
        isVetted: true,
      },
    };

    const position: TokenizedYieldPosition = {
      marketIdentifier: { chainId: '42161', address: '0xmarket-current' },
      pt: {
        token: {
          tokenUid: { chainId: '42161', address: '0xpt-current' },
          name: 'PT-CURRENT',
          symbol: 'PT-CURRENT',
          isNative: false,
          decimals: 18,
          iconUri: undefined,
          isVetted: true,
        },
        exactAmount: '1000',
      },
      yt: {
        token: {
          tokenUid: { chainId: '42161', address: '0xyt-current' },
          name: 'YT-CURRENT',
          symbol: 'YT-CURRENT',
          isNative: false,
          decimals: 18,
          iconUri: undefined,
          isVetted: true,
        },
        exactAmount: '0',
        claimableRewards: [
          {
            token: {
              tokenUid: { chainId: '42161', address: '0xunderlying' },
              name: 'USDai',
              symbol: 'USDai',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '250',
          },
          {
            token: {
              tokenUid: { chainId: '42161', address: '0xreward' },
              name: 'ARB',
              symbol: 'ARB',
              isNative: false,
              decimals: 18,
              iconUri: undefined,
              isVetted: true,
            },
            exactAmount: '500',
          },
        ],
      },
    };

    const result = await executeCompound({
      onchainActionsClient,
      clients,
      txExecutionMode: 'execute',
      walletAddress: '0x0000000000000000000000000000000000000001',
      position,
      currentMarket,
    });

    expect(onchainActionsClient.createTokenizedYieldClaimRewards).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      ytTokenUid: position.yt.token.tokenUid,
    });
    expect(onchainActionsClient.createSwap).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      amount: '500',
      amountType: 'exactIn',
      fromTokenUid: { chainId: '42161', address: '0xreward' },
      toTokenUid: currentMarket.underlyingToken.tokenUid,
      slippageTolerance: '0.01',
    });
    expect(onchainActionsClient.createTokenizedYieldBuyPt).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      marketAddress: currentMarket.marketIdentifier.address,
      inputTokenUid: currentMarket.underlyingToken.tokenUid,
      amount: '745',
      slippage: '0.01',
    });

    expect(executeTransactionMock).toHaveBeenCalledTimes(3);
    expect(executeTransactionMock.mock.calls[0]?.[1]).toMatchObject({ to: '0xclaim' });
    expect(executeTransactionMock.mock.calls[1]?.[1]).toMatchObject({ to: '0xswap' });
    expect(executeTransactionMock.mock.calls[2]?.[1]).toMatchObject({ to: '0xbuy' });
    expect(result.lastTxHash).toBe('0xbuyhash');
  });
});
