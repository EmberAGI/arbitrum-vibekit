import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { GlobalPortfolioTopBar } from './GlobalPortfolioTopBar';

const projectionInput = {
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
    },
  ],
  reservations: [],
  ownedUnits: [],
  activePositionScopes: [],
};

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('@/hooks/usePrivyWalletClient', () => ({
  usePrivyWalletClient: () => ({
    privyWallet: {
      address: '0x1111111111111111111111111111111111111111',
    },
  }),
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    ready: true,
    authenticated: true,
  }),
  useLogin: () => ({
    login: vi.fn(),
  }),
  useLogout: () => ({
    logout: vi.fn(),
  }),
}));

vi.mock('@/contexts/AgentContext', () => ({
  useAgent: () => ({
    config: {
      id: 'agent-portfolio-manager',
    },
    domainProjection: {
      portfolioProjectionInput: projectionInput,
    },
  }),
}));

vi.mock('@/contexts/AuthoritativeAgentSnapshotCache', () => ({
  useAuthoritativeAgentSnapshotCache: () => ({
    getSnapshot: () => null,
  }),
}));

vi.mock('@/utils/agentCommandRoute', () => ({
  invokeAgentCommandRoute: vi.fn(),
}));

describe('GlobalPortfolioTopBar', () => {
  it('renders the portfolio metrics and benchmark in a persistent sticky site bar', () => {
    const html = renderToStaticMarkup(React.createElement(GlobalPortfolioTopBar));

    expect(html).toContain('sticky top-0 z-40');
    expect(html).toContain('Gross exposure');
    expect(html).toContain('Net worth');
    expect(html).toContain('Unmanaged');
    expect(html).toContain('Benchmark');
    expect(html).toContain('USD');
  });

  it('renders the Ember logo and wordmark as the leftmost top bar item', () => {
    const html = renderToStaticMarkup(React.createElement(GlobalPortfolioTopBar));

    expect(html).toContain('src="/ember-sidebar-logo.png"');
    expect(html).toContain('src="/ember-name.svg"');
    expect(html).toContain('border-r border-[#D7C5B4]');
    expect(html).toContain('pr-5');
    expect(html).toContain('xl:pl-3');
    expect(html.indexOf('src="/ember-sidebar-logo.png"')).toBeLessThan(
      html.indexOf('Gross exposure'),
    );
    expect(html.indexOf('src="/ember-name.svg"')).toBeLessThan(html.indexOf('Gross exposure'));
  });

  it('renders connected wallet controls on the right side of the site bar', () => {
    const html = renderToStaticMarkup(React.createElement(GlobalPortfolioTopBar));

    expect(html).toContain('ml-auto');
    expect(html).toContain('0x1111...1111');
    expect(html).toContain('Logout');
    expect(html).toContain('Manage Wallet');
    expect(html).toContain('href="/wallet"');
  });

  it('renders benchmark and wallet pills with the same fixed height', () => {
    const html = renderToStaticMarkup(React.createElement(GlobalPortfolioTopBar));

    expect(html).toContain('inline-flex h-9 cursor-default items-center');
    expect(html).toContain('flex h-9 items-center gap-3 rounded-full');
  });

  it('renders a wallet address hover popout with the address and copy control', () => {
    const html = renderToStaticMarkup(React.createElement(GlobalPortfolioTopBar));

    expect(html).toContain('group/wallet-address');
    expect(html).toContain('group-hover/wallet-address:pointer-events-auto');
    expect(html).toContain('Wallet address');
    expect(html).not.toContain('Full wallet address');
    expect(html).toContain('0x1111111111111111111111111111111111111111');
    expect(html).toContain('Copy');
  });
});
