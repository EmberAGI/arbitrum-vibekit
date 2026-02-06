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
});
