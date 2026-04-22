import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDetailPage } from './AgentDetailPage';

const mocks = vi.hoisted(() => ({
  useOnchainActionsIconMaps: vi.fn(),
}));

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
    useOnchainActionsIconMaps: (...args: unknown[]) =>
      mocks.useOnchainActionsIconMaps(...args),
  };
});

function createManagedMandateEditorProjection(overrides: Record<string, unknown> = {}) {
  return {
    managedMandateEditor: {
      ownerAgentId: 'agent-portfolio-manager',
      targetAgentId: 'ember-lending',
      targetAgentRouteId: 'agent-ember-lending',
      targetAgentKey: 'ember-lending-primary',
      targetAgentTitle: 'Ember Lending',
      mandateRef: 'mandate-ember-lending-001',
      managedMandate: {
        lending_policy: {
          collateral_policy: {
            assets: [
              {
                asset: 'GMX',
                max_allocation_pct: 35,
              },
            ],
          },
          borrow_policy: {
            allowed_assets: ['ARB'],
          },
          risk_policy: {
            max_ltv_bps: 7000,
            min_health_factor: '1.25',
          },
        },
      },
      agentWallet: '0x00000000000000000000000000000000000000b1',
      rootUserWallet: '0x00000000000000000000000000000000000000a1',
      rootedWalletContextId: 'rwc-ember-lending-thread-001',
      reservation: {
        reservationId: 'reservation-ember-lending-001',
        purpose: 'position.enter',
        controlPath: 'lending.supply',
        rootAsset: 'GMX',
        quantity: '10',
      },
      ...overrides,
    },
  };
}

describe('AgentDetailPage (skeleton numbers)', () => {
  beforeEach(() => {
    mocks.useOnchainActionsIconMaps.mockReset();
    mocks.useOnchainActionsIconMaps.mockReturnValue({
      isLoaded: false,
      chainIconByName: {},
      tokenIconBySymbol: {
        GMX: 'https://icons.test/gmx.png',
      },
    });
  });

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

  it('requests icons for the full managed-mandate token set shown by the workbench', () => {
    renderToStaticMarkup(
      React.createElement(AgentDetailPage, {
        agentId: 'agent-ember-lending',
        agentName: 'Ember Lending',
        agentDescription: 'desc',
        creatorName: 'Ember AI Team',
        creatorVerified: true,
        profile: {
          chains: ['Arbitrum'],
          protocols: ['Pi Runtime', 'Shared Ember Domain Service'],
          tokens: ['USDC'],
        },
        metrics: {},
        isHired: true,
        isHiring: false,
        hasLoadedView: true,
        onHire: () => {},
        onFire: () => {},
        onSync: () => {},
        onBack: () => {},
        allowedPools: [],
        lifecycleState: {
          phase: 'active',
        } as never,
        domainProjection: createManagedMandateEditorProjection(),
      }),
    );

    expect(mocks.useOnchainActionsIconMaps).toHaveBeenCalledWith({
      chainNames: ['Arbitrum'],
      tokenSymbols: expect.arrayContaining([
        'USDC',
        'WETH',
        'WBTC',
        'ARB',
        'USDT',
        'DAI',
        'GMX',
      ]),
    });
  });
});
