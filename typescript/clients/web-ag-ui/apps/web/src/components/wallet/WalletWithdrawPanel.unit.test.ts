// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  formatWithdrawTokenAmount,
  getPreferredSelectedTokenKey,
  WalletWithdrawPanel,
} from './WalletWithdrawPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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
    expect(html).not.toContain('Move funds from your MetaMask smart account to another wallet.');
    expect(html).toContain('No connected destination wallet detected');
    expect(html).toContain('Custom destination');
    expect(html).toContain('Amount');
    expect(html).toContain('Max');
    expect(html).not.toContain('rounded-[18px] border border-[#E7DBD0] bg-[#FCF5EC] p-3');
    expect(html).not.toContain('withdraw-token-select');
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

  it('renders token buttons with icons and balance affordances', () => {
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
          {
            tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
            symbol: 'USDC',
            amount: '1234500',
            decimals: 6,
          },
          {
            tokenUid: { chainId: '42161', address: '0x3333333333333333333333333333333333333333' },
            symbol: 'MYSTERY',
            amount: '42',
            decimals: 0,
          },
        ],
        onWithdrawSubmitted: vi.fn(),
      }),
    );

    expect(html).toContain('aria-label="Select ETH"');
    expect(html).toContain('aria-label="Select USDC"');
    expect(html).toContain('/api/icon-proxy?url=');
    expect(html).toContain('1 ETH available');
    expect(html).toContain('1.2345 USDC available');
    expect(html).toContain('MY');
  });

  it('formats selected token raw amounts for Max using token decimals', () => {
    expect(formatWithdrawTokenAmount({ amount: '1234500', decimals: 6 })).toBe('1.2345');
    expect(formatWithdrawTokenAmount({ amount: '1000000000000000000', decimals: 18 })).toBe('1');
    expect(formatWithdrawTokenAmount({ amount: '42', decimals: 0 })).toBe('42');
  });

  it('fills the amount input with the selected token balance when Max is clicked', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
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
            {
              tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
              symbol: 'USDC',
              amount: '1234500',
              decimals: 6,
            },
          ],
          onWithdrawSubmitted: vi.fn(),
        }),
      );
    });

    const amountInput = container.querySelector<HTMLInputElement>('#withdraw-amount-input');
    expect(amountInput?.value).toBe('');

    const usdcButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Select USDC',
    );
    act(() => {
      usdcButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const maxButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Max',
    );
    act(() => {
      maxButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(amountInput?.value).toBe('1.2345');

    act(() => {
      root.unmount();
    });
  });
});
