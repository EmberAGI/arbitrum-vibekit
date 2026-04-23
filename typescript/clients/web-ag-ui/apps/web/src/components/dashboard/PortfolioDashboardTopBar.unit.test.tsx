import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PortfolioDashboardTopBar } from './PortfolioDashboardTopBar';

describe('PortfolioDashboardTopBar', () => {
  it('renders the benchmark teaser inline without a separate portfolio heading', () => {
    const html = renderToStaticMarkup(
      React.createElement(PortfolioDashboardTopBar, {
        view: {
          benchmarkAssetLabel: 'USDC',
          metrics: [
            {
              label: 'Gross exposure',
              value: '$2.8K',
              positiveAssetsValue: '$2.9K',
              liabilitiesValue: '$100',
            },
            {
              label: 'Net worth',
              value: '$2.6K',
            },
            {
              label: 'Unallocated',
              value: '$2K',
              valueClassName: 'text-[#0F5A38]',
            },
          ],
        },
      }),
    );

    expect(html).not.toMatch(/>Portfolio</);
    expect(html).not.toMatch(/>Benchmark<\/div><button/);
    expect(html).toContain('>Benchmark<');
    expect(html).toContain('Gross exposure');
    expect(html).toContain('Net worth');
    expect(html).toContain('Unallocated');
    expect(html).toContain('type="button"');
    expect(html).toContain('title="Benchmark switching coming soon"');
    expect(html).toContain('self-center');
    expect(html).toContain('hover:border-[#E8C9AA]');
    expect(html).toContain('hover:bg-[#FFF7F2]');
  });
});
