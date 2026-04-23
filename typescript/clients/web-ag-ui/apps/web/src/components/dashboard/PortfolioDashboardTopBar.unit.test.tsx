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
    expect(html).toContain('title="Preview benchmark selector"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('cursor-default');
    expect(html).toContain('self-center');
    expect(html).toContain('xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]');
    expect(html).not.toContain('>Soon<');
    expect(html).toContain('Selected Benchmark');
    expect(html).toContain('rounded-[20px] border border-[#eadac7] bg-[#fffdf8]/98');
    expect(html).toContain('pointer-events-auto');
    expect(html).toContain("before:-top-2");
    expect(html).toContain("before:h-2");
    expect(html).toContain('group-hover/benchmark:opacity-100');
    expect(html).toContain('group-focus-within/benchmark:opacity-100');
    expect(html).toContain('Pro Only');
    expect(html).toContain('hover:border-[#E8C9AA]');
    expect(html).toContain('hover:bg-[#FFF7F2]');
    expect(html).not.toContain('Benchmark switching is coming soon.');
    expect(html).toContain(
      'It gives you a quick baseline, so you can tell if active management is helping.',
    );
    expect(html).not.toContain('rounded-[16px] border border-dashed border-[#d8c3ad] bg-[#fffaf2]');
  });
});
