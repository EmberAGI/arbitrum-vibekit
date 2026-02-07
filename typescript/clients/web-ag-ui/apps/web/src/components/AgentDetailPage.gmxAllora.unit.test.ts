import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { AgentDetailPage } from './AgentDetailPage';

vi.mock('../hooks/usePrivyWalletClient', () => ({
  usePrivyWalletClient: () => ({
    walletClient: null,
    privyWallet: null,
    chainId: null,
    switchChain: async () => undefined,
    isLoading: false,
    error: null,
  }),
}));

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
        avatar: '📈',
        avatarBg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        profile: { chains: [], protocols: [], tokens: [] },
        metrics: {
          iteration: 0,
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          rebalanceCycles: 0,
        },
        fullMetrics: undefined,
        isHired: false,
        isHiring: false,
        isFiring: false,
        isSyncing: false,
        currentCommand: undefined,
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
  });

  it('renders the fund-wallet blocker for GMX when requested by the agent', () => {
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
        avatar: '📈',
        avatarBg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        profile: { chains: [], protocols: [], tokens: [] },
        metrics: {
          iteration: 0,
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          rebalanceCycles: 0,
        },
        fullMetrics: undefined,
        isHired: true,
        isHiring: false,
        isFiring: false,
        isSyncing: false,
        currentCommand: undefined,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        activeInterrupt: {
          type: 'gmx-fund-wallet-request',
          message: 'Fund the wallet with ETH then continue.',
          walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        allowedPools: [],
        onInterruptSubmit: () => {},
        taskId: undefined,
        taskStatus: undefined,
        haltReason: undefined,
        executionError: undefined,
        delegationsBypassActive: undefined,
        onboarding: { step: 1, totalSteps: 3, key: 'gmx' },
        transactions: [],
        telemetry: [],
        events: [],
        settings: undefined,
        onSettingsChange: () => {},
      }),
    );

    expect(html).toContain('Fund Wallet');
    expect(html).toContain('Continue');
    expect(html).toContain('0xaaaaaaaaaa');
  });
});
