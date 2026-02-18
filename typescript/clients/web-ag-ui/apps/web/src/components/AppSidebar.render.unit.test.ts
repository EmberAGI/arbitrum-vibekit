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
});
