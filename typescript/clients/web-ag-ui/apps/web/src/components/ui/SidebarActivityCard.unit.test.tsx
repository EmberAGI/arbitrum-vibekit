// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SidebarActivityCard } from './SidebarActivityCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('SidebarActivityCard', () => {
  it('matches the reference card structure for exposure, active styling, and token overflow', () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarActivityCard, {
        card: {
          id: 'agent-ember-lending',
          label: 'Ember Lending',
          statusTone: 'active',
          valueUsd: 90,
          positiveAssetsUsd: 85,
          liabilitiesUsd: 5,
          allocationShare: 1 / 3,
          allocationShareLabel: 'portfolio',
          avatarUri: '/ember-lending-avatar.svg',
          avatarBackground: '#9896FF',
          usesBrandedAvatar: true,
          tokenBreakdown: [
            { asset: 'USDC', share: 0.5 },
            { asset: 'ETH', share: 0.2 },
            { asset: 'USDT', share: 0.15 },
            { asset: 'ARB', share: 0.1 },
            { asset: 'GMX', share: 0.05 },
          ],
        },
        active: true,
      }),
    );

    expect(html).toContain('border-[#E8C9AA] bg-[#FFF5EA]');
    expect(html).toContain('left-0 top-0 bottom-0 w-1 rounded-r-full bg-[#fd6731]');
    expect(html).toContain('src="/ember-lending-avatar.svg"');
    expect(html).toContain('background:#9896FF');
    expect(html).not.toContain('bg-[linear-gradient(135deg,#F0E4D6_0%,#D8C4AF_100%)]');
    expect(html).toContain('$85');
    expect(html).toContain('$5');
    expect(html).toContain('33% of portfolio');
    expect(html.match(/\$90 gross/g) ?? []).toHaveLength(1);
    expect(html).toContain('USDC');
    expect(html).toContain('ETH');
    expect(html).toContain('USDT');
    expect(html).not.toContain('>ARB<');
    expect(html).not.toContain('>GMX<');
    expect(html).toContain('…');
  });

  it('shows a compact top-holdings tooltip for the portfolio agent card on hover', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        React.createElement(SidebarActivityCard, {
          card: {
            id: 'agent-portfolio-manager',
            label: 'Ember Portfolio Agent',
            statusTone: 'active',
            valueUsd: 1000,
            allocationShare: 1,
            allocationShareLabel: 'portfolio',
            tokenBreakdown: [],
            tokenHoldings: [
              {
                asset: 'USDC',
                amount: 1000,
                share: 0.5,
                valueUsd: 500,
                iconUri: '/icons/usdc.svg',
              },
              { asset: 'WETH', amount: 0.05, share: 0.2, valueUsd: 200 },
              { asset: 'WBTC', amount: 0.0012, share: 0.15, valueUsd: 150 },
              { asset: 'ARB', amount: 80, share: 0.1, valueUsd: 100 },
              { asset: 'GMX', amount: 4, share: 0.04, valueUsd: 40 },
              { asset: 'DAI', amount: 10, share: 0.01, valueUsd: 10 },
            ],
          },
        }),
      );
    });

    const card = container.querySelector('button');
    expect(card).not.toBeNull();
    expect(document.body.textContent).not.toContain('Top holdings');

    act(() => {
      card?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 24, clientY: 24 }));
    });

    const pageText = document.body.textContent ?? '';
    expect(pageText).toContain('Top holdings');
    expect(pageText).toContain('USDC');
    expect(pageText).toContain('1,000');
    expect(pageText).toContain('50%');
    expect(pageText).toContain('$500');
    expect(pageText).toContain('WETH');
    expect(pageText).toContain('0.05');
    expect(pageText).not.toContain('DAI');
    expect(document.body.querySelector('img[src="/icons/usdc.svg"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
