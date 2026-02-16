import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { AgentDetailPage } from './AgentDetailPage';

describe('AgentDetailPage (GMX Allora)', () => {
  it('keeps the metrics tab labeled as Metrics for GMX Allora in the for-hire view', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-gmx-allora',
        agentName: 'GMX Allora Trader',
        agentDescription: 'Trades GMX perps using Allora 8-hour prediction feeds.',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        ownerAddress: undefined,
        rank: 3,
        rating: 5,
        profile: { chains: [], protocols: [], tokens: [] },
        metrics: {
          iteration: 0,
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          rebalanceCycles: 0,
        },
        fullMetrics: undefined,
        hasLoadedView: true,
        isHired: false,
        isHiring: false,
        isFiring: false,
        isSyncing: false,
        currentCommand: undefined,
        uiError: null,
        onClearUiError: () => {},
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        activeInterrupt: undefined,
        allowedPools: [],
        onInterruptSubmit: () => {},
        taskId: undefined,
        taskStatus: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: undefined,
        onboarding: undefined,
        transactions: [],
        telemetry: [],
        events: [],
        settings: undefined,
        onSettingsChange: () => {},
      }),
    );

    expect(html).toContain('>Metrics<');
    expect(html).not.toContain('>Signals<');
    expect(html).not.toContain('>Latest Signal<');
    expect(html).not.toContain('>Latest Plan<');

    // For-hire view uses the shared chart-card layout (same as CLMM).
    expect(html).toContain('APY Change');
    expect(html).toContain('Total Users');
  });

  it('does not render GMX execution/signal fields in the for-hire view (charts only)', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-gmx-allora',
        agentName: 'GMX Allora Trader',
        agentDescription: 'Trades GMX perps using Allora 8-hour prediction feeds.',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        ownerAddress: undefined,
        rank: 3,
        rating: 5,
        profile: {
          chains: ['Arbitrum One'],
          protocols: ['GMX', 'Allora'],
          tokens: ['USDC'],
          agentIncome: 4109.5,
          aum: 42180,
          apy: 9.2,
          totalUsers: 58,
        },
        metrics: {
          iteration: 1,
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          aumUsd: 8,
          apy: 9.2,
          lifetimePnlUsd: 0,
        },
        fullMetrics: {
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          iteration: 1,
          previousPrice: 67602.611,
          latestCycle: {
            cycle: 1,
            action: 'open',
            reason: 'Signal confidence 1 >= 0.62; opening long position.',
            marketSymbol: 'BTC/USDC',
            side: 'long',
            leverage: 2,
            sizeUsd: 10,
            txHash: '0xb24f42dbfc6c0a30c16b7660ad5878a2a92abfb53a5ce02609bfd7e06a2cde7e',
            timestamp: '2026-02-12T02:11:35.221Z',
            prediction: {
              topic: 'allora:btc:8h',
              horizonHours: 8,
              confidence: 1,
              direction: 'up',
              predictedPrice: 67603,
              timestamp: '2026-02-12T02:11:30.000Z',
            },
            metrics: {
              confidence: 1,
              decisionThreshold: 0.62,
              cooldownRemaining: 0,
            },
          },
          latestSnapshot: {
            poolAddress: '0x47c031236e19d024b42f8AE6780E44A573170703',
            totalUsd: 8,
            timestamp: '2026-02-12T02:11:35.221Z',
            positionTokens: [],
          },
        },
        hasLoadedView: true,
        isHired: false,
        isHiring: false,
        isFiring: false,
        isSyncing: false,
        currentCommand: undefined,
        uiError: null,
        onClearUiError: () => {},
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        activeInterrupt: undefined,
        allowedPools: [],
        onInterruptSubmit: () => {},
        taskId: undefined,
        taskStatus: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: undefined,
        onboarding: undefined,
        transactions: [
          {
            cycle: 1,
            action: 'open',
            txHash: '0xb24f42dbfc6c0a30c16b7660ad5878a2a92abfb53a5ce02609bfd7e06a2cde7e',
            status: 'success',
            timestamp: '2026-02-12T02:11:35.221Z',
          },
        ],
        telemetry: [],
        events: [
          {
            type: 'artifact',
            artifact: {
              artifactId: 'gmx-allora-execution-result',
              description:
                'Rebalance: OPEN LONG 2x $10.00 · Allora 8h signal: bullish · confidence 100% · tx 0xb24f42...',
              parts: [
                {
                  kind: 'data',
                  data: {
                    ok: true,
                    txHashes: [
                      '0xe62fc16e0f8e3dcdd8fdb429a6d43a29921fa7ee1cdea9b861fc29d9f0e38854',
                      '0xb24f42dbfc6c0a30c16b7660ad5878a2a92abfb53a5ce02609bfd7e06a2cde7e',
                    ],
                    lastTxHash:
                      '0xb24f42dbfc6c0a30c16b7660ad5878a2a92abfb53a5ce02609bfd7e06a2cde7e',
                  },
                },
              ],
            },
          },
        ],
        settings: undefined,
        onSettingsChange: () => {},
      }),
    );

    // Shared pre-hire chart cards.
    expect(html).toContain('APY Change');
    expect(html).toContain('Total Users');

    // GMX-specific diagnostics should not appear until after hire/onboarding.
    expect(html).not.toContain('Latest Execution');
    expect(html).not.toContain('Signal Confidence');
    expect(html).not.toContain('Transaction Hashes');
    expect(html).not.toContain('arbiscan.io/tx/');
    expect(html).not.toContain('Rebalance Cycles');
  });

  it('renders the shared chart cards (and values) for GMX Allora in the for-hire view', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-gmx-allora',
        agentName: 'GMX Allora Trader',
        agentDescription: 'Trades GMX perps using Allora 8-hour prediction feeds.',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        ownerAddress: undefined,
        rank: 3,
        rating: 5,
        profile: {
          chains: ['Arbitrum One'],
          protocols: ['GMX', 'Allora'],
          tokens: ['USDC'],
          agentIncome: 4109.5,
          aum: 42180,
          apy: 9.2,
          totalUsers: 58,
        },
        metrics: {
          iteration: 2,
          cyclesSinceRebalance: 1,
          staleCycles: 0,
          aumUsd: 16,
          apy: 9.2,
          lifetimePnlUsd: 0,
        },
        fullMetrics: {
          cyclesSinceRebalance: 1,
          staleCycles: 0,
          iteration: 2,
          previousPrice: 67602.611,
          latestCycle: {
            cycle: 2,
            action: 'hold',
            reason: 'Inference metrics unchanged since last trade; holding position.',
            marketSymbol: 'BTC/USDC',
            side: undefined,
            leverage: undefined,
            sizeUsd: undefined,
            timestamp: '2026-02-12T02:40:35.221Z',
          },
          latestSnapshot: {
            poolAddress: '0x47c031236e19d024b42f8AE6780E44A573170703',
            totalUsd: 16,
            leverage: 2,
            timestamp: '2026-02-12T02:40:35.221Z',
            positionTokens: [],
          },
        },
        hasLoadedView: true,
        isHired: false,
        isHiring: false,
        isFiring: false,
        isSyncing: false,
        currentCommand: undefined,
        uiError: null,
        onClearUiError: () => {},
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        activeInterrupt: undefined,
        allowedPools: [],
        onInterruptSubmit: () => {},
        taskId: undefined,
        taskStatus: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: undefined,
        onboarding: undefined,
        transactions: [],
        telemetry: [],
        events: [],
        settings: undefined,
        onSettingsChange: () => {},
      }),
    );

    expect(html).toContain('APY Change');
    expect(html).toContain('Total Users');

    // Values should render when `hasLoadedView` is true.
    expect(html).toContain('9%');
    expect(html).toContain('58');
  });
});
