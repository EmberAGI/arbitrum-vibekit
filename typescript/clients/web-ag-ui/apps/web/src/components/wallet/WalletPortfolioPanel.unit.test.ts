import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletPortfolioPanel } from './WalletPortfolioPanel';

describe('WalletPortfolioPanel', () => {
  it('renders the asset allocation treemap without the legacy token balances section', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletPortfolioPanel, {
        treemapItems: [
          {
            id: 'treemap:42161:usdc',
            label: 'USDC',
            value: 30.5,
            tone: 'cash',
            valueLabel: '$30.50',
            shareLabel: '100%',
          },
        ],
        totalExposureLabel: '$30.50',
      }),
    );

    expect(html).not.toContain('Token Balances');
    expect(html).toContain('USDC');
    expect(html).toContain('Asset allocation treemap');
    expect(html).toContain('Wallet + visible deployed exposure');
    expect(html).toContain('$30.50');
    expect(html).not.toContain('DeFi');
    expect(html).not.toContain('Perpetual Positions');
  });
});
