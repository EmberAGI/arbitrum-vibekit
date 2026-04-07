import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arbitrum, mainnet, polygon } from 'viem/chains';

import { AppSidebar, getSidebarAgentHref, getWalletSelectorChains } from './AppSidebar';

const pushMock = vi.fn();
const useAgentListMock = vi.fn();
const getAllAgentsMock = vi.fn();
const getVisibleAgentsMock = vi.fn();
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
    usePrivy: () => ({ ready: true, authenticated: true }),
    useLogin: () => ({ login: vi.fn() }),
    useLogout: () => ({ logout: vi.fn() }),
  };
});

vi.mock('@/hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      privyWallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
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
    }),
  };
});

vi.mock('@/contexts/AgentContext', () => {
  return {
    useAgent: () => ({
      config: { id: 'inactive-agent' },
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
    pathnameMock = '/hire-agents';

    useAgentListMock.mockReturnValue({ agents: {} });
    getAllAgentsMock.mockReturnValue([]);
    getVisibleAgentsMock.mockReturnValue([]);
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

  it('uses the widened sidebar frame and refreshed logo asset', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('w-[312px]');
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

  it('uses a thin left nav indicator without active card backgrounds', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('w-px h-6 bg-[#fd6731]');
    expect(html).not.toContain('text-white bg-[#1C1D23] border border-[#2F313B]');
    expect(html).not.toContain('bg-[#1B1C21] border border-[#2B2D36]');
  });

  it('uses mono typography for sidebar section labels and badges', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));

    expect(html).toContain('text-[10px] font-mono font-medium text-[#A7A7B2]');
    expect(html).toContain('text-[11px] font-mono font-medium text-[#6F7280] tracking-[0.12em]');
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

  it('routes portfolio agent sidebar clicks to the chat tab deep link', () => {
    expect(getSidebarAgentHref('agent-portfolio-manager')).toBe(
      '/hire-agents/agent-portfolio-manager?tab=chat',
    );
    expect(getSidebarAgentHref('agent-ember-lending')).toBe('/hire-agents/agent-ember-lending');
  });
});
