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
  it('renders publish CTA illustration from a public asset', () => {
    const html = renderToStaticMarkup(
      React.createElement(HireAgentsPage, {
        agents: [],
        featuredAgents: [],
      }),
    );

    expect(html).toContain('src="/hire-publish-agent.png"');
    expect(html).toContain('alt="Publish agent illustration"');
  });

  it('lays out publish CTA image flush to the left edge with no top/bottom padding', () => {
    const html = renderToStaticMarkup(
      React.createElement(HireAgentsPage, {
        agents: [],
        featuredAgents: [],
      }),
    );

    expect(html).toContain('class="relative flex items-stretch justify-between gap-6 pr-5"');
    expect(html).toContain('class="w-[308px] self-stretch shrink-0"');
  });

  it('renders featured agent bio text when provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(HireAgentsPage, {
        agents: [],
        featuredAgents: [
          {
            id: 'agent-pendle',
            name: 'Pendle Yield',
            creator: 'Ember AI Team',
            description: 'Rotates into higher-yield Pendle markets as conditions change.',
            status: 'for_hire',
            isLoaded: true,
          },
        ],
      }),
    );

    expect(html.indexOf('by')).toBeLessThan(html.indexOf('Chains'));
    expect(html.indexOf('Chains')).toBeLessThan(html.indexOf('Pendle Yield'));
    expect(html).toContain('Rotates into higher-yield Pendle markets as conditions change.');
    expect(html.indexOf('Pendle Yield')).toBeLessThan(
      html.indexOf('Rotates into higher-yield Pendle markets as conditions change.'),
    );
  });

  it('uses the shared Ember team logo in the byline and omits the extra built-by badge', () => {
    const html = renderToStaticMarkup(
      React.createElement(HireAgentsPage, {
        agents: [],
        featuredAgents: [
          {
            id: 'agent-clmm',
            name: 'Camelot CLMM',
            creator: 'Ember AI Team',
            status: 'for_hire',
            isLoaded: true,
          },
        ],
      }),
    );

    expect(html).toContain('src="/ember-by-tag-logo.png"');
    expect(html).not.toContain('Built by Ember AI');
  });

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
    expect(html.indexOf('Chains')).toBeLessThan(html.indexOf('Protocols'));
    expect(html.indexOf('Protocols')).toBeLessThan(html.indexOf('Tokens'));
    expect(html).toContain('class="w-[72px] h-[72px] rounded-full flex-shrink-0 overflow-hidden ring-1 ring-white/10 bg-black/30 flex items-center justify-center"');

    // Stats section.
    expect(html).toContain('AUM');
    expect(html).toContain('30d Income');
    expect(html).toContain('APY');
    expect(html).toContain('Users');

    // Token icons render and clamp.
    // We show 2 icons plus an in-row ellipsis "icon" to avoid clipping in narrow featured cards.
    expect(html).toContain('https://icons.test/eth.png');
    expect(html).toContain('https://icons.test/usdc.png');
    expect(html).not.toContain('https://icons.test/weth.png');
    expect(html).toContain('…');
    expect(html).not.toContain('+2');
  });

  it('supports collapsing featured-card metrics on the hire page without navigating away', () => {
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
            aum: 123456,
            weeklyIncome: 987,
            apy: 12,
            users: 42,
          },
        ],
        initialCollapsedFeaturedCardIds: ['agent-gmx-allora'],
      }),
    );

    expect(html).toContain('aria-label="Expand metrics"');
    expect(html).not.toContain('30d Income');
    expect(html).not.toContain('grid grid-cols-4 gap-3 px-4 py-3 bg-black/20 border-t border-white/10');
  });

  it('enforces a consistent featured-card height so highlighted cards stay aligned', () => {
    const html = renderToStaticMarkup(
      React.createElement(HireAgentsPage, {
        agents: [],
        featuredAgents: [
          {
            id: 'agent-gmx-allora',
            name: 'GMX x Allora',
            creator: 'Ember AI Team',
            description:
              'Uses directional and volatility signals for adaptive position sizing across market regimes.',
            status: 'for_hire',
            isLoaded: true,
            aum: 123456,
            weeklyIncome: 987,
            apy: 12,
            users: 42,
          },
          {
            id: 'agent-pendle',
            name: 'Pendle Yield',
            creator: 'Ember AI Team',
            status: 'for_hire',
            isLoaded: true,
            aum: 56789,
            weeklyIncome: 654,
            apy: 8,
            users: 24,
          },
        ],
      }),
    );

    expect(html).toContain('min-w-[340px] w-[340px] h-[230px]');
    expect(html).toContain('px-4 pb-2 flex-1 min-h-0 overflow-hidden');
  });

  it('clamps featured descriptions to two lines in compact cards', () => {
    const html = renderToStaticMarkup(
      React.createElement(HireAgentsPage, {
        agents: [],
        featuredAgents: [
          {
            id: 'agent-gmx-allora',
            name: 'GMX x Allora',
            creator: 'Ember AI Team',
            description:
              'Uses directional and volatility signals for adaptive position sizing across market regimes with automatic risk controls and fast execution.',
            status: 'for_hire',
            isLoaded: true,
          },
        ],
      }),
    );

    expect(html).toContain('[display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]');
  });
});
