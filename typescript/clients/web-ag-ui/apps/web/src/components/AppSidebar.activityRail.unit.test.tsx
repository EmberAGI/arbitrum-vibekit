// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from './AppSidebar';

// React's act() helper expects this flag under the lightweight jsdom runner.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const useAgentListMock = vi.fn();
const getVisibleAgentsMock = vi.fn();
const getAuthoritativeSnapshotMock = vi.fn();
let pathnameMock = '/hire-agents/agent-ember-lending';

vi.mock('next/navigation', () => {
  return {
    usePathname: () => pathnameMock,
    useRouter: () => ({ push: vi.fn() }),
  };
});

vi.mock('next/link', () => {
  return {
    default: (
      props: React.PropsWithChildren<{
        href: string;
        className?: string;
        'aria-label'?: string;
      }>,
    ) =>
      React.createElement(
        'a',
        { href: props.href, className: props.className, 'aria-label': props['aria-label'] },
        props.children,
      ),
  };
});

vi.mock('next/image', () => {
  return {
    default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
  };
});

vi.mock('@privy-io/react-auth', () => {
  return {
    usePrivy: () => ({ ready: true, authenticated: true }),
    useLogin: () => ({ login: vi.fn() }),
    useLogout: () => ({ logout: vi.fn() }),
  };
});

vi.mock('@/hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      privyWallet: { address: '0x1111111111111111111111111111111111111111' },
      chainId: 42161,
      switchChain: vi.fn(),
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
      isLoaded: true,
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
    getVisibleAgents: () => getVisibleAgentsMock(),
  };
});

describe('AppSidebar activity rail', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    pathnameMock = '/hire-agents/agent-ember-lending';
    getAuthoritativeSnapshotMock.mockReset();
    getAuthoritativeSnapshotMock.mockReturnValue(null);
    getVisibleAgentsMock.mockReset();
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
    useAgentListMock.mockReset();
    useAgentListMock.mockReturnValue({
      agents: {
        'agent-portfolio-manager': {
          synced: true,
          lifecyclePhase: 'active',
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Shared Ember'],
            tokens: ['USDC'],
            pools: [],
            allowedPools: [],
          },
        },
        'agent-ember-lending': {
          synced: true,
          lifecyclePhase: 'active',
          profile: {
            chains: ['Arbitrum'],
            protocols: ['Aave'],
            tokens: ['USDC'],
            pools: [],
            allowedPools: [],
          },
        },
      },
    });
  });

  afterEach(() => {
    container.remove();
  });

  it('collapses the activity rail into avatar-only navigation', () => {
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(AppSidebar));
    });

    const collapseButton = container.querySelector(
      'button[aria-label="Collapse agent activity rail"]',
    ) as HTMLButtonElement | null;

    expect(collapseButton).not.toBeNull();

    act(() => {
      collapseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(
      container.querySelector('button[aria-label="Expand agent activity rail"]'),
    ).not.toBeNull();
    expect(container.querySelector('button[aria-label="Ember Portfolio Agent"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Ember Lending"]')).not.toBeNull();
    expect(container.querySelector('a[aria-label="Hire specialists"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
