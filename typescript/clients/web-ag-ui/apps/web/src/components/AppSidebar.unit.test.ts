import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { arbitrum, mainnet, polygon } from 'viem/chains';

import { AppSidebar, getWalletSelectorChains } from './AppSidebar';

vi.mock('next/navigation', () => {
  return {
    usePathname: () => '/hire-agents',
    useRouter: () => ({ push: vi.fn() }),
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
    useAgentList: () => ({ agents: {} }),
  };
});

vi.mock('@/config/agents', () => {
  return {
    getAllAgents: () => [],
  };
});

describe('AppSidebar wallet actions', () => {
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
});
