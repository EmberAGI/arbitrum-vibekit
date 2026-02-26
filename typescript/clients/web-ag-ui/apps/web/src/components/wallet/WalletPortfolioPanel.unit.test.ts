import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletPortfolioPanel } from './WalletPortfolioPanel';

describe('WalletPortfolioPanel', () => {
  it('renders balances with USD values, a wallet USD total, and grouped portfolio positions', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletPortfolioPanel, {
        balances: [
          {
            tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
            amount: '25000000',
            symbol: 'USDC',
            decimals: 6,
            valueUsd: 25,
          },
          {
            tokenUid: { chainId: '42161', address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8' },
            amount: '5500000',
            symbol: 'USDC.e',
            decimals: 6,
            valueUsd: 5.5,
          },
        ],
        positions: {
          perpetuals: [
            {
              key: 'perp-1',
              marketAddress: '0x47c031236e19d024b42f8AE6780E44A573170703',
              positionSide: 'long',
              sizeInUsd: '123.45',
            },
          ],
          pendle: [
            {
              marketIdentifier: {
                chainId: '42161',
                address: '0x6f9d8ef8fbcf2f3928c1f0f7f53295d85f4cb8d9',
              },
              pt: { exactAmount: '1.00' },
              yt: { exactAmount: '0.50' },
            },
          ],
          liquidity: [
            {
              positionId: 'lp-1',
              poolName: 'USDC/WETH',
              positionValueUsd: '512.88',
            },
          ],
        },
      }),
    );

    expect(html).toContain('Token Balances');
    expect(html).toContain('USDC');
    expect(html).toContain('USDC.e');
    expect(html).toContain('Wallet Total');
    expect(html).toContain('$30.50');
    expect(html).toContain('$25.00');
    expect(html).toContain('$5.50');
    expect(html).toContain('Perpetual Positions');
    expect(html).toContain('Pendle Positions');
    expect(html).toContain('CLMM / Camelot Positions');
    expect(html).toContain('USDC/WETH');
  });
});
