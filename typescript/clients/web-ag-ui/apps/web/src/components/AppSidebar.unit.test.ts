import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arbitrum, mainnet, polygon } from 'viem/chains';

import { AppSidebar, getSidebarAgentHref, getWalletSelectorChains } from './AppSidebar';

const privyMocks = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
  walletAddress: '0x1111111111111111111111111111111111111111' as string | null,
  chainId: 42161 as number | null,
  switchChain: vi.fn(),
}));

const pushMock = vi.fn();
const useAgentListMock = vi.fn();
const getAllAgentsMock = vi.fn();
const getVisibleAgentsMock = vi.fn();
const getAuthoritativeSnapshotMock = vi.fn();
let pathnameMock = '/hire-agents';

vi.mock('next/navigation', () => {
  return {
    usePathname: () => pathnameMock,
    useRouter: () => ({ push: pushMock }),
  };
});

vi.mock('next/link', () => {
  return {
    default: (props: React.PropsWithChildren<{ href: string; className?: string }>) =>
      React.createElement('a', { href: props.href, className: props.className }, props.children),
  };
});

vi.mock('next/image', () => {
  return {
    default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
  };
});

vi.mock('@privy-io/react-auth', () => {
  return {
    usePrivy: () => ({ ready: privyMocks.ready, authenticated: privyMocks.authenticated }),
    useLogin: () => ({ login: privyMocks.login }),
    useLogout: () => ({ logout: privyMocks.logout }),
  };
});

vi.mock('@/hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      privyWallet: privyMocks.walletAddress ? { address: privyMocks.walletAddress } : null,
      chainId: privyMocks.chainId,
      switchChain: privyMocks.switchChain,
      isLoading: false,
      error: null,
    }),
  };
});

vi.mock('@/hooks/useUpgradeToSmartAccount', () => {
  return {
    useUpgradeToSmartAccount: () => ({
      isDeployed: true,
      isLoading: false,
      isUpgrading: false,
      upgradeToSmartAccount: vi.fn(),
      error: null,
    }),
  };
});

vi.mock('@/hooks/useOnchainActionsIconMaps', () => {
  return {
    useOnchainActionsIconMaps: () => ({
      chainIconByName: {},
      tokenIconBySymbol: {},
    }),
  };
});

vi.mock('@/contexts/AgentContext', () => {
  return {
    useAgent: () => ({
      config: { id: 'inactive-agent' },
      domainProjection: {},
      uiState: {
        task: null,
        haltReason: null,
        executionError: null,
        setupComplete: false,
        operatorConfig: null,
        delegationBundle: null,
      },
    }),
  };
});

vi.mock('@/contexts/AuthoritativeAgentSnapshotCache', () => {
  return {
    useAuthoritativeAgentSnapshotCache: () => ({
      getSnapshot: getAuthoritativeSnapshotMock,
      setSnapshot: vi.fn(),
    }),
  };
});

vi.mock('@/contexts/AgentListContext', () => {
  return {
    useAgentList: () => useAgentListMock(),
  };
});

vi.mock('@/config/agents', () => {
  return {
    getAllAgents: () => getAllAgentsMock(),
    getVisibleAgents: () => getVisibleAgentsMock(),
  };
});

describe('AppSidebar wallet actions', () => {
  beforeEach(() => {
    pushMock.mockReset();
    useAgentListMock.mockReset();
    getAllAgentsMock.mockReset();
    getVisibleAgentsMock.mockReset();
    getAuthoritativeSnapshotMock.mockReset();
    pathnameMock = '/hire-agents';
    privyMocks.ready = true;
    privyMocks.authenticated = true;
    privyMocks.walletAddress = '0x1111111111111111111111111111111111111111';
    privyMocks.chainId = 42161;
    privyMocks.login.mockReset();
    privyMocks.logout.mockReset();
    privyMocks.switchChain.mockReset();
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-privy-app-id';

    useAgentListMock.mockReturnValue({ agents: {} });
    getAllAgentsMock.mockReturnValue([]);
    getVisibleAgentsMock.mockReturnValue([]);
    getAuthoritativeSnapshotMock.mockReturnValue(null);
  });

  it('limits wallet selector chain options to Arbitrum and Ethereum', () => {
    const result = getWalletSelectorChains([arbitrum, mainnet, polygon]);
    expect(result.map((chain) => chain.id)).toEqual([arbitrum.id, mainnet.id]);
  });

  it('renders a secondary Manage Wallet link when wallet is connected', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('Manage Wallet');
    expect(html).toContain('href="/wallet"');
  });

  it('uses the widened sidebar frame and a light shell palette', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('w-[312px]');
    expect(html).toContain('bg-[#F7EFE3] border-r border-[#DDC8B3] text-[#3C2A21]');
    expect(html).toContain('src="/ember-sidebar-logo.png"');
  });

  it('links the platform chat entry to the portfolio agent conversation', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('Ember Portfolio Agent');
    expect(html).toContain('href="/hire-agents/agent-portfolio-manager?tab=chat"');
  });

  it('does not keep the hire nav item highlighted on the portfolio agent route', () => {
    pathnameMock = '/hire-agents/agent-portfolio-manager';

    const html = renderToStaticMarkup(React.createElement(AppSidebar));
    const activeMarkers = html.match(/w-px h-6 bg-\[#fd6731\]/g) ?? [];

    expect(activeMarkers).toHaveLength(1);
  });

  it('uses simplified sidebar icons for agents and activity state', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('lucide-bot');
    expect(html).toContain('lucide-terminal');
    expect(html).not.toContain('lucide-loader');
    expect(html).not.toContain('animate-spin');
    expect(html).not.toContain('text-red-400');
    expect(html).not.toContain('text-teal-400');
    expect(html).not.toContain('text-blue-400');
  });

  it('uses a thin left nav indicator with light hover surfaces', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('w-px h-6 bg-[#fd6731]');
    expect(html).toContain('hover:bg-[#F0E2D2]');
    expect(html).not.toContain('hover:bg-[#1B1C21]');
    expect(html).not.toContain('text-white bg-[#1C1D23] border border-[#2F313B]');
  });

  it('uses mono typography for sidebar section labels and badges', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('text-[10px] font-mono font-medium text-[#8A6F58]');
    expect(html).toContain('text-[11px] font-mono font-medium text-[#A98C74] tracking-[0.12em]');
  });

  it('shows only user-facing agents in activity sections', () => {
    getAllAgentsMock.mockReturnValue([
      {
        id: 'agent-portfolio-manager',
        name: 'Ember Portfolio Agent',
        chains: [],
        protocols: [],
        tokens: [],
      },
      { id: 'agent-pi-example', name: 'Pi Example Agent', chains: [], protocols: [], tokens: [] },
    ]);
    getVisibleAgentsMock.mockReturnValue([
      {
        id: 'agent-portfolio-manager',
        name: 'Ember Portfolio Agent',
        chains: [],
        protocols: [],
        tokens: [],
      },
    ]);
    useAgentListMock.mockReturnValue({
      agents: {
        'agent-portfolio-manager': { taskState: 'running' },
        'agent-pi-example': { taskState: 'running' },
      },
    });

    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('Ember Portfolio Agent');
    expect(html).not.toContain('Pi Example Agent');
  });

  it('renders workbench-style sidebar cards when agent exposure data is available', () => {
    getVisibleAgentsMock.mockReturnValue([
      {
        id: 'agent-portfolio-manager',
        name: 'Ember Portfolio Agent',
        chains: ['Arbitrum'],
        protocols: ['Shared Ember'],
        tokens: ['USDC', 'WETH'],
      },
      {
        id: 'agent-ember-lending',
        name: 'Ember Lending',
        chains: ['Arbitrum'],
        protocols: ['Aave'],
        tokens: ['USDC'],
      },
    ]);
    useAgentListMock.mockReturnValue({
      agents: {
        'agent-portfolio-manager': {
          synced: true,
          taskState: 'working',
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Shared Ember'],
            tokens: ['USDC', 'WETH'],
            pools: [],
            allowedPools: [],
          },
          metrics: {
            iteration: 0,
            cyclesSinceRebalance: 0,
            staleCycles: 0,
            aumUsd: 12_000,
          },
        },
        'agent-ember-lending': {
          synced: true,
          taskState: 'working',
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Aave'],
            tokens: ['USDC'],
            pools: [],
            allowedPools: [],
          },
          metrics: {
            iteration: 0,
            cyclesSinceRebalance: 0,
            staleCycles: 0,
            aumUsd: 4_000,
            apy: 8.2,
          },
        },
      },
    });

    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('rounded-[18px]');
    expect(html).toContain('px-3 pt-4 pb-3');
    expect(html).toContain('$12k gross');
    expect(html).toContain('$4k gross');
    expect(html).toContain('USDC');
    expect(html).toContain('ETH');
  });

  it('uses the portfolio projection for portfolio and lending allocation bars when cached state is available', () => {
    getVisibleAgentsMock.mockReturnValue([
      {
        id: 'agent-portfolio-manager',
        name: 'Ember Portfolio Agent',
        chains: ['Arbitrum'],
        protocols: ['Shared Ember'],
        tokens: ['USDC'],
      },
      {
        id: 'agent-ember-lending',
        name: 'Ember Lending',
        chains: ['Arbitrum'],
        protocols: ['Aave'],
        tokens: ['USDC'],
      },
    ]);
    useAgentListMock.mockReturnValue({
      agents: {
        'agent-portfolio-manager': {
          synced: true,
          taskState: 'working',
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Shared Ember'],
            tokens: ['USDC'],
            pools: [],
            allowedPools: [],
          },
          metrics: {
            iteration: 0,
            cyclesSinceRebalance: 0,
            staleCycles: 0,
            aumUsd: 12_000,
          },
        },
        'agent-ember-lending': {
          synced: true,
          taskState: 'working',
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Aave'],
            tokens: ['USDC'],
            pools: [],
            allowedPools: [],
          },
          metrics: {
            iteration: 0,
            cyclesSinceRebalance: 0,
            staleCycles: 0,
            aumUsd: 4_000,
            apy: 8.2,
          },
        },
      },
    });
    getAuthoritativeSnapshotMock.mockReturnValue({
      thread: {
        domainProjection: {
          portfolioProjectionInput: {
            benchmarkAsset: 'USD',
            walletContents: [
              {
                asset: 'USDC',
                network: 'arbitrum',
                quantity: '40',
                valueUsd: 40,
              },
              {
                asset: 'WETH',
                network: 'arbitrum',
                quantity: '0.01',
                valueUsd: 20,
                economicExposures: [
                  {
                    asset: 'ETH',
                    quantity: '0.01',
                  },
                ],
              },
            ],
            reservations: [
              {
                reservationId: 'reservation-1',
                agentId: 'agent-ember-lending',
                purpose: 'position.enter',
                controlPath: 'lending.supply',
                createdAt: '2026-03-30T00:00:00.000Z',
                status: 'active',
                unitAllocations: [
                  {
                    unitId: 'unit-usdc-1',
                    quantity: '25',
                  },
                ],
              },
            ],
            ownedUnits: [
              {
                unitId: 'unit-usdc-1',
                rootAsset: 'USDC',
                network: 'arbitrum',
                quantity: '25',
                benchmarkAsset: 'USD',
                benchmarkValue: 25,
                reservationId: 'reservation-1',
                positionScopeId: 'scope-1',
              },
            ],
            activePositionScopes: [
              {
                scopeId: 'scope-1',
                kind: 'lending-position',
                network: 'arbitrum',
                protocolSystem: 'aave',
                containerRef: 'aave:scope-1',
                status: 'active',
                marketState: {
                  availableBorrowsUsd: '18',
                  borrowableHeadroomUsd: '12.5',
                  currentLtvBps: 3200,
                  liquidationThresholdBps: 7800,
                  healthFactor: '2.1',
                },
                members: [
                  {
                    memberId: 'collateral-usdc',
                    role: 'collateral',
                    asset: 'USDC',
                    quantity: '25',
                    valueUsd: 25,
                    economicExposures: [
                      {
                        asset: 'USDC',
                        quantity: '25',
                      },
                    ],
                    state: {
                      withdrawableQuantity: '10',
                      supplyApr: '0.03',
                    },
                  },
                  {
                    memberId: 'debt-usdt',
                    role: 'debt',
                    asset: 'USDT',
                    quantity: '5',
                    valueUsd: 5,
                    economicExposures: [
                      {
                        asset: 'USDT',
                        quantity: '5',
                      },
                    ],
                    state: {
                      borrowApr: '0.06',
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    });

    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('$90 gross');
    expect(html).toContain('$30 gross');
    expect(html).toContain('100% of portfolio');
    expect(html).toContain('33% of portfolio');
    expect(html).toContain('ETH');
    expect(html).toContain('USDT');
    expect(html).toContain('Unallocated');
    expect(html).not.toContain('$12k gross');
    expect(html).not.toContain('$4k gross');
  });

  it('routes portfolio agent sidebar clicks to the chat tab deep link', () => {
    expect(getSidebarAgentHref('agent-portfolio-manager')).toBe(
      '/hire-agents/agent-portfolio-manager?tab=chat',
    );
    expect(getSidebarAgentHref('agent-ember-lending')).toBe('/hire-agents/agent-ember-lending');
  });

  it('shows a non-interactive fallback instead of a broken login CTA when Privy is not configured', () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = '';
    privyMocks.ready = false;
    privyMocks.authenticated = false;
    privyMocks.walletAddress = null;
    privyMocks.chainId = null;

    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('Privy auth unavailable');
    expect(html).not.toContain('Login / Connect');
  });
});
