// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { GlobalPortfolioTopBar } from './GlobalPortfolioTopBar';

const { handleHardNavigationClickMock } = vi.hoisted(() => ({
  handleHardNavigationClickMock: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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
let domainProjectionMock: Record<string, unknown> = {
  portfolioProjectionInput: projectionInput,
};
let walletAddressMock: string | null = '0x1111111111111111111111111111111111111111';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('next/link', () => ({
  default: (
    props: React.PropsWithChildren<{
      href: string;
      className?: string;
      onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    }>,
  ) =>
    React.createElement(
      'a',
      {
        href: props.href,
        className: props.className,
        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          props.onClick?.(event);
        },
      },
      props.children,
    ),
}));

vi.mock('@/utils/hardNavigation', () => ({
  handleHardNavigationClick: handleHardNavigationClickMock,
}));

vi.mock('@/hooks/usePrivyWalletClient', () => ({
  usePrivyWalletClient: () => ({
    privyWallet: walletAddressMock ? { address: walletAddressMock } : null,
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
    domainProjection: domainProjectionMock,
  }),
}));

vi.mock('@/contexts/AuthoritativeAgentSnapshotCache', () => ({
  useAuthoritativeAgentSnapshotCache: () => ({
    getSnapshot: () => null,
  }),
  useAuthoritativeAgentSnapshotCacheVersion: () => 0,
}));

vi.mock('@/utils/agentCommandRoute', () => ({
  invokeAgentCommandRoute: vi.fn(),
}));

describe('GlobalPortfolioTopBar', () => {
  beforeEach(() => {
    handleHardNavigationClickMock.mockReset();
    domainProjectionMock = {
      portfolioProjectionInput: projectionInput,
    };
    walletAddressMock = '0x1111111111111111111111111111111111111111';
  });

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
    expect(html).toContain('w-[calc(312px-1rem)]');
    expect(html).toContain('md:w-[calc(312px-1.25rem)]');
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

  it('does not hard reload the page when opening Manage Wallet', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(GlobalPortfolioTopBar));
    });

    const manageWalletLink = Array.from(container.querySelectorAll('a')).find(
      (link) => link.textContent === 'Manage Wallet',
    );

    expect(manageWalletLink?.getAttribute('href')).toBe('/wallet');

    act(() => {
      manageWalletLink?.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(handleHardNavigationClickMock).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
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

  it('omits wallet controls when no wallet address is connected', () => {
    walletAddressMock = null;

    const html = renderToStaticMarkup(React.createElement(GlobalPortfolioTopBar));

    expect(html).toContain('sticky top-0 z-40');
    expect(html).toContain('Gross exposure');
    expect(html).not.toContain('Wallet address');
    expect(html).not.toContain('Copy');
    expect(html).not.toContain('Manage Wallet');
  });

  it('keeps the site bar visible while portfolio metrics are loading', () => {
    domainProjectionMock = {};

    const html = renderToStaticMarkup(React.createElement(GlobalPortfolioTopBar));

    expect(html).toContain('sticky top-0 z-40');
    expect(html).toContain('src="/ember-sidebar-logo.png"');
    expect(html).toContain('Gross exposure');
    expect(html).toContain('Net worth');
    expect(html).toContain('Unmanaged');
    expect(html).toContain('Benchmark');
    expect(html).toContain('0x1111...1111');
  });
});
