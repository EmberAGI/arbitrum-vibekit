import { describe, expect, it } from 'vitest';

import type { PerpetualPosition } from '../clients/onchainActions.js';
import type { GmxAlloraTelemetry } from '../domain/types.js';

import { applyExposureLimits } from './exposure.js';

describe('applyExposureLimits', () => {
  it('blocks opening trades that exceed per-market exposure', () => {
    const telemetry: GmxAlloraTelemetry = {
      cycle: 2,
      action: 'open',
      reason: 'Signal strong',
      marketSymbol: 'BTC/USDC',
      side: 'long',
      leverage: 2,
      sizeUsd: 160,
      prediction: {
        topic: 'BTC/USD - Price Prediction - 8h',
        horizonHours: 8,
        confidence: 0.8,
        direction: 'up',
        predictedPrice: 47000,
        timestamp: '2026-02-05T12:00:00.000Z',
      },
      timestamp: '2026-02-05T12:01:00.000Z',
      metrics: {
        confidence: 0.8,
        decisionThreshold: 0.62,
        cooldownRemaining: 0,
      },
    };

    const positions: PerpetualPosition[] = [
      {
        chainId: '42161',
        key: '0xpos',
        contractKey: '0xcontract',
        account: '0xwallet',
        marketAddress: '0xmarket',
        sizeInUsd: '200',
        sizeInTokens: '0.01',
        collateralAmount: '100',
        pendingBorrowingFeesUsd: '0',
        increasedAtTime: '0',
        decreasedAtTime: '0',
        positionSide: 'long',
        isLong: true,
        fundingFeeAmount: '0',
        claimableLongTokenAmount: '0',
        claimableShortTokenAmount: '0',
        isOpening: false,
        pnl: '0',
        positionFeeAmount: '0',
        traderDiscountAmount: '0',
        uiFeeAmount: '0',
        collateralToken: {
          tokenUid: { chainId: '42161', address: '0xusdc' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          iconUri: null,
          isVetted: true,
        },
      },
    ];

    const result = applyExposureLimits({
      telemetry,
      positions,
      targetMarketAddress: '0xmarket',
      maxMarketExposureUsd: 300,
      maxTotalExposureUsd: 500,
    });

    expect(result.action).toBe('hold');
    expect(result.reason).toContain('Exposure limit');
    expect(result.sizeUsd).toBeUndefined();
  });
});
