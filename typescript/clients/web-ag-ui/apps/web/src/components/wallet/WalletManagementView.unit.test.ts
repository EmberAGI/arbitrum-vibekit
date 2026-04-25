import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletManagementView } from './WalletManagementView';

describe('WalletManagementView', () => {
  it('renders the wallet dashboard without the placeholder manage wallet hero', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletManagementView, {
        walletAddress: '0x1111111111111111111111111111111111111111',
        connectedDestinationAddress: null,
        walletClient: null,
        portfolio: {
          balances: [
            {
              tokenUid: { chainId: '42161', address: '0x0000000000000000000000000000000000000000' },
              symbol: 'ETH',
              amount: '1000000000000000000',
              decimals: 18,
              valueUsd: 2_000,
            },
          ],
          positions: {
            perpetuals: [
              {
                key: 'perp-1',
                marketAddress: '0x2222222222222222222222222222222222222222',
                positionSide: 'long',
                sizeInUsd: '123.45',
              },
            ],
            pendle: [
              {
                marketIdentifier: { chainId: '42161', address: '0x3333333333333333333333333333333333333333' },
                pt: { exactAmount: '1' },
                yt: { exactAmount: '2' },
              },
            ],
            liquidity: [
              {
                positionId: 'lp-1',
                poolName: 'Camelot ETH/USDC',
                positionValueUsd: '321.00',
              },
            ],
          },
        },
      }),
    );

    expect(html).not.toContain('Manage Wallet');
    expect(html).not.toContain('Wallet dashboard');
    expect(html).not.toMatch(/>Portfolio</);
    expect(html).toContain('mx-auto w-full max-w-[1400px] space-y-6 px-0 pt-0 pb-6');
    expect(html).not.toContain('mx-auto w-full max-w-[1400px] p-6 space-y-6');
    expect(html).toContain('space-y-6 px-4 pb-6 sm:px-6');
    expect(html).toContain('grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]');
    expect(html).not.toContain('Benchmark');
    expect(html).not.toContain('Gross exposure');
    expect(html).not.toContain('Grouped into 3 asset families');
    expect(html).toContain('Unmanaged');
    expect(html).toContain('Deployed');
    expect(html).toContain('Camelot ETH/USDC');
    expect(html).toContain('Composition');
    expect(html).toContain('Accounting');
    expect(html).toContain('Asset allocation treemap');
    expect(html).not.toContain('Token Balances');
    expect(html.indexOf('Composition')).toBeLessThan(html.indexOf('DeFi'));
    expect(html.indexOf('DeFi')).toBeLessThan(html.indexOf('Perpetual Positions'));
    expect(html.indexOf('Composition')).toBeLessThan(html.indexOf('Assets'));
    expect(html.indexOf('Assets')).toBeLessThan(html.indexOf('Accounting'));
    expect(html.indexOf('Accounting')).toBeLessThan(html.indexOf('Withdraw'));
    expect(html).toContain('Perpetual Positions');
    expect(html).toContain('Pendle Positions');
    expect(html).toContain('CLMM / Camelot Positions');
    expect(html).toContain('Withdraw');
  });
});
