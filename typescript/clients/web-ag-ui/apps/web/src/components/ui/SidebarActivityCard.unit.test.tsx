import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SidebarActivityCard } from './SidebarActivityCard';

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
    expect(html).toContain('bg-[#fd6731]');
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
});
