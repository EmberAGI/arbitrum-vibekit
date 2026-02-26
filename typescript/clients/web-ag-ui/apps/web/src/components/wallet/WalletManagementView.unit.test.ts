import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletManagementView } from './WalletManagementView';

describe('WalletManagementView', () => {
  it('renders wallet portfolio and withdraw sections', () => {
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

    expect(html).toContain('Manage Wallet');
    expect(html).toContain('Token Balances');
    expect(html).toContain('Perpetual Positions');
    expect(html).toContain('Pendle Positions');
    expect(html).toContain('CLMM / Camelot Positions');
    expect(html).toContain('Withdraw');
  });
});
