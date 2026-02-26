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
      view: {
        task: null,
        command: null,
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
});
