import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../hooks/useOnchainActionsIconMaps', () => {
  return {
    useOnchainActionsIconMaps: () => ({
      isLoaded: true,
      chainIconByName: {
        'arbitrum one': 'https://icons.test/arbitrum.png',
      },
      tokenIconBySymbol: {
        ETH: 'https://icons.test/eth.png',
        USDC: 'https://icons.test/usdc.png',
        WETH: 'https://icons.test/weth.png',
        ARB: 'https://icons.test/arb.png',
        GMX: 'https://icons.test/gmx.png',
        PENDLE: 'https://icons.test/pendle.png',
      },
    }),
  };
});

import { HireAgentsPage } from './HireAgentsPage';

describe('HireAgentsPage (top cards)', () => {
  it('shows labeled chain/protocol/token icon groups and stats, with overflow indicator for tokens', () => {
    const html = renderToStaticMarkup(
      React.createElement(HireAgentsPage, {
        agents: [],
        featuredAgents: [
          {
            id: 'agent-gmx-allora',
            name: 'GMX x Allora',
            creator: 'Ember AI Team',
            status: 'for_hire',
            isLoaded: true,
            chains: ['Arbitrum One'],
            protocols: ['GMX'],
            tokens: ['ETH', 'USDC', 'WETH', 'ARB', 'GMX', 'PENDLE'],
            aum: 123456,
            weeklyIncome: 987,
            apy: 12,
            users: 42,
            trendMultiplier: '3x',
          },
        ],
      }),
    );

    // Small headers distinguishing what logos are what.
    expect(html).toContain('Chains');
    expect(html).toContain('Protocols');
    expect(html).toContain('Tokens');

    // Stats section.
    expect(html).toContain('AUM');
    expect(html).toContain('30d Income');
    expect(html).toContain('APY');
    expect(html).toContain('Users');

    // Token icons render and clamp.
    // We show 2 icons plus an in-row ellipsis "icon" to avoid clipping in narrow featured cards.
    expect(html).toContain(encodeURIComponent('https://icons.test/eth.png'));
    expect(html).toContain(encodeURIComponent('https://icons.test/usdc.png'));
    expect(html).not.toContain(encodeURIComponent('https://icons.test/weth.png'));
    expect(html).toContain('…');
    expect(html).not.toContain('+2');
  });
});
