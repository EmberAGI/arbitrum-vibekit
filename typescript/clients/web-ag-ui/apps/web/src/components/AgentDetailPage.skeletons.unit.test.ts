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

vi.mock('../hooks/useOnchainActionsIconMaps', () => {
  return {
    useOnchainActionsIconMaps: () => ({
      isLoaded: false,
      chainIconByName: {},
      tokenIconBySymbol: {
        GMX: 'https://icons.test/gmx.png',
      },
    }),
  };
});

describe('AgentDetailPage (skeleton numbers)', () => {
  it('renders skeletons for numeric stats until the agent view is loaded', () => {
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
        hasLoadedView: false,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
      }),
    );

    expect(html).toContain('animate-pulse');
  });

  it('renders agent avatar image even when icon maps are still loading', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-gmx-allora',
        agentName: 'GMX Allora Trader',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: ['Arbitrum One'],
          protocols: ['GMX'],
          tokens: ['GMX'],
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

    expect(html).toContain('https://icons.test/gmx.png');
    expect(html).not.toContain('h-[220px] w-[220px] rounded-full mb-6 mx-auto');
  });
});
