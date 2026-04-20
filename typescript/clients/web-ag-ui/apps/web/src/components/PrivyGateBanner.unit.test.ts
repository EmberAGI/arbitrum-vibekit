import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrivyGateBanner } from './PrivyGateBanner';

const mocks = vi.hoisted(() => ({
  pathname: '/hire-agents/agent-clmm',
  privyWalletAddress: null as string | null,
  login: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  useLogin: () => ({
    login: mocks.login,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('@/hooks/usePrivyWalletClient', () => ({
  usePrivyWalletClient: () => ({
    privyWallet: mocks.privyWalletAddress ? { address: mocks.privyWalletAddress } : null,
  }),
}));

describe('PrivyGateBanner', () => {
  beforeEach(() => {
    mocks.pathname = '/hire-agents/agent-clmm';
    mocks.privyWalletAddress = null;
    mocks.login.mockReset();
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'test-privy-app-id';
  });

  it('keeps the sign-in banner for retired Pi routes without a wallet', () => {
    mocks.pathname = '/hire-agents/agent-pi-example';

    const html = renderToStaticMarkup(React.createElement(PrivyGateBanner));

    expect(html).toContain('Sign in with Privy to create a thread and interact with agents.');
  });

  it('keeps the sign-in banner for other hire routes without a wallet', () => {
    const html = renderToStaticMarkup(React.createElement(PrivyGateBanner));

    expect(html).toContain('Sign in with Privy to create a thread and interact with agents.');
  });

  it('hides the sign-in banner when Privy is not configured', () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = '';

    const html = renderToStaticMarkup(React.createElement(PrivyGateBanner));

    expect(html).toBe('');
  });
});
