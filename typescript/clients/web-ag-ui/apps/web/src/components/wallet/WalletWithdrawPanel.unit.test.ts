import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { getPreferredSelectedTokenKey, WalletWithdrawPanel } from './WalletWithdrawPanel';

describe('WalletWithdrawPanel', () => {
  it('defaults token selection to the first available balance when current selection is empty or stale', () => {
    const balances = [
      {
        tokenUid: { chainId: '42161', address: '0x0000000000000000000000000000000000000000' },
        symbol: 'ETH',
        amount: '1000000000000000000',
        decimals: 18,
      },
      {
        tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
        symbol: 'USDC',
        amount: '2000000',
        decimals: 6,
      },
    ];

    expect(getPreferredSelectedTokenKey({ currentKey: '', balances })).toBe(
      '42161:0x0000000000000000000000000000000000000000',
    );
    expect(getPreferredSelectedTokenKey({ currentKey: 'stale-key', balances })).toBe(
      '42161:0x0000000000000000000000000000000000000000',
    );
    expect(
      getPreferredSelectedTokenKey({
        currentKey: '42161:0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        balances,
      }),
    ).toBe('42161:0xaf88d065e77c8cc2239327c5edb3a432268e5831');
  });

  it('shows manual guidance when no connected destination wallet is available', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletWithdrawPanel, {
        sourceAddress: '0x1111111111111111111111111111111111111111',
        connectedDestinationAddress: null,
        walletClient: null,
        balances: [
          {
            tokenUid: { chainId: '42161', address: '0x0000000000000000000000000000000000000000' },
            symbol: 'ETH',
            amount: '1000000000000000000',
            decimals: 18,
          },
        ],
        onWithdrawSubmitted: vi.fn(),
      }),
    );

    expect(html).toContain('Withdraw');
    expect(html).toContain('No connected destination wallet detected');
    expect(html).toContain('Custom destination');
    expect(html).toContain('Amount');
  });

  it('shows the connected wallet destination address when available', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletWithdrawPanel, {
        sourceAddress: '0x1111111111111111111111111111111111111111',
        connectedDestinationAddress: '0x2222222222222222222222222222222222222222',
        walletClient: null,
        balances: [
          {
            tokenUid: { chainId: '42161', address: '0x0000000000000000000000000000000000000000' },
            symbol: 'ETH',
            amount: '1000000000000000000',
            decimals: 18,
          },
        ],
        onWithdrawSubmitted: vi.fn(),
      }),
    );

    expect(html).toContain('Connected wallet');
    expect(html).toContain('0x2222222222222222222222222222222222222222');
  });
});
