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
  it('renders manage wallet heading', () => {
    const html = renderToStaticMarkup(React.createElement(WalletPage));
    expect(html).toContain('Manage Wallet');
  });
});
