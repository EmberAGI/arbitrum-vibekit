import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => {
  return {
    usePathname: () => '/hire-agents',
    useRouter: () => ({
      push: vi.fn(),
    }),
  };
});

vi.mock('next/image', () => {
  return {
    default: ({ alt = '', ...props }: React.ImgHTMLAttributes<HTMLImageElement>) =>
      React.createElement('img', { alt, ...props }),
  };
});

vi.mock('next/link', () => {
  return {
    default: ({
      href,
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href, ...props }, children),
  };
});

vi.mock('@privy-io/react-auth', () => {
  return {
    usePrivy: () => ({
      ready: true,
      authenticated: false,
    }),
    useLogin: () => ({
      login: vi.fn(),
    }),
    useLogout: () => ({
      logout: vi.fn(),
    }),
  };
});

vi.mock('@/hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      privyWallet: null,
      chainId: null,
      switchChain: async () => {},
      isLoading: false,
      error: null,
    }),
  };
});

vi.mock('@/hooks/useUpgradeToSmartAccount', () => {
  return {
    useUpgradeToSmartAccount: () => ({
      isDeployed: false,
      isLoading: false,
      isUpgrading: false,
      upgradeToSmartAccount: async () => {},
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
      view: {
        task: null,
        command: null,
        haltReason: null,
        executionError: null,
      },
    }),
  };
});

vi.mock('@/contexts/AgentListContext', () => {
  return {
    useAgentList: () => ({
      agents: {},
    }),
  };
});

import { AppSidebar } from './AppSidebar';

describe('AppSidebar', () => {
  it('uses widened sidebar width', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));
    expect(html).toContain('w-[312px]');
  });

  it('uses the refreshed sidebar logo asset', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));
    expect(html).toContain('src="/ember-sidebar-logo.png"');
  });

  it('uses a robot icon for the agents nav entry', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));
    expect(html).toContain('lucide-bot');
  });

  it('uses neutral activity icons and a terminal icon for active agents', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));
    expect(html).toContain('lucide-terminal');
    expect(html).not.toContain('lucide-loader');
    expect(html).not.toContain('animate-spin');
    expect(html).not.toContain('text-red-400');
    expect(html).not.toContain('text-teal-400');
    expect(html).not.toContain('text-blue-400');
  });

  it('uses a thin left nav indicator instead of active card backgrounds', () => {
    const html = renderToStaticMarkup(React.createElement(AppSidebar));
    expect(html).toContain('w-px h-6 bg-[#fd6731]');
    expect(html).not.toContain('text-white bg-[#1C1D23] border border-[#2F313B]');
    expect(html).not.toContain('bg-[#1B1C21] border border-[#2B2D36]');
  });
});
