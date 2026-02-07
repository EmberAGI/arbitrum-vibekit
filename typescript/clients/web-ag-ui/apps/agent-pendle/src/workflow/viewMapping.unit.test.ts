import { describe, expect, it } from 'vitest';

import { buildPendleLatestSnapshotFromOnchain } from './viewMapping.js';

describe('buildPendleLatestSnapshotFromOnchain', () => {
  it('prefers implied-APY PV estimate when wallet PT usd quote is far off', () => {
    const operatorConfig = {
      walletAddress: '0x0000000000000000000000000000000000000001',
      executionWalletAddress: '0x0000000000000000000000000000000000000001',
      baseContributionUsd: 10,
      fundingTokenAddress: '0x0000000000000000000000000000000000000002',
      targetYieldToken: {
        marketAddress: '0x2092fa5d02276b3136a50f3c2c3a6ed45413183e',
        ptAddress: '0x1bf1311fcf914a69dd5805c9b06b72f80539cb3f',
        ytAddress: '0x214d1950027863f5e1ec6369797d9a51ef1bb66f',
        ptSymbol: 'PT-sUSDai-19FEB2026',
        ytSymbol: 'YT-sUSDai-19FEB2026',
        underlyingSymbol: 'sUSDai',
        apy: 18.0558,
        impliedApyPct: 18.0558,
        maturity: '2026-02-19T00:00:00.000Z',
      },
    } as const;

    const snapshot = buildPendleLatestSnapshotFromOnchain({
      operatorConfig,
      position: {
        marketIdentifier: {
          address: operatorConfig.targetYieldToken.marketAddress,
          chainId: '42161',
        },
        pt: {
          token: {
            tokenUid: { address: operatorConfig.targetYieldToken.ptAddress, chainId: '42161' },
            name: 'PT',
            symbol: operatorConfig.targetYieldToken.ptSymbol,
            decimals: 18,
            isNative: false,
            iconUri: '',
            isVetted: false,
          },
          // 2.992938391857157538 PT
          exactAmount: '2992938391857157538',
        },
        yt: {
          token: {
            tokenUid: { address: operatorConfig.targetYieldToken.ytAddress, chainId: '42161' },
            name: 'YT',
            symbol: operatorConfig.targetYieldToken.ytSymbol,
            decimals: 18,
            isNative: false,
            iconUri: '',
            isVetted: false,
          },
          exactAmount: '0',
          claimableRewards: [],
        },
      },
      walletBalances: [
        {
          tokenUid: { address: operatorConfig.targetYieldToken.ptAddress, chainId: '42161' },
          amount: '2992938391857157538',
          decimals: 18,
          symbol: operatorConfig.targetYieldToken.ptSymbol,
          // Bad quote (roughly half of what stable PV should be)
          valueUsd: 1.359658,
        },
      ],
      timestamp: '2026-02-07T03:08:00.000Z',
      positionOpenedAt: '2026-02-07T03:08:00.000Z',
    });

    const ptToken = snapshot.positionTokens.find(
      (token) => token.symbol === operatorConfig.targetYieldToken.ptSymbol,
    );
    expect(ptToken?.valueUsd).toBeDefined();

    // Should be close to the stable PV (around 2.97), not the 1.36 wallet quote.
    expect(ptToken!.valueUsd!).toBeGreaterThan(2.5);
    expect(ptToken!.valueUsd!).toBeLessThan(3.1);

    // With no opened-total carried in, we initialize opened value to current, so net PnL is 0.
    expect(snapshot.pendle?.netPnlUsd).toBe(0);
  });
});
