import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AgentDetailPage } from './AgentDetailPage';

vi.mock('../hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      walletClient: null,
      privyWallet: null,
      chainId: null,
      switchChain: async () => {},
      isLoading: false,
      error: null,
    }),
  };
});

describe('AgentDetailPage (pre-hire + onboarding affordances)', () => {
  it('renders a lightweight metrics preview before the agent is hired', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: false,
        isHiring: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('APY Change');
    expect(html).toContain('Total Users');
  });

  it('renders metrics tab as disabled while onboarding is in progress', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-clmm',
        agentName: 'Camelot CLMM',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        onboarding: { step: 1 },
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toMatch(
      new RegExp('<button[^>]*disabled[^>]*>\\s*Metrics\\s*</button>'),
    );
  });
});
