import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import WalletPage from './page';

vi.mock('@privy-io/react-auth', () => {
  return {
    useWallets: () => ({ wallets: [] }),
  };
});

vi.mock('@/hooks/usePrivyWalletClient', () => {
  return {
    usePrivyWalletClient: () => ({
      walletClient: null,
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

describe('/wallet page', () => {
  it('renders the signed-in wallet dashboard without the placeholder hero heading', () => {
    const html = renderToStaticMarkup(React.createElement(WalletPage));
    expect(html).not.toContain('Manage Wallet');
    expect(html).not.toMatch(/>Portfolio</);
    expect(html).toContain('Gross exposure');
    expect(html).toContain('Composition');
    expect(html).not.toContain('Grouped into 0 asset families');
  });
});
