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
              label: 'Unmanaged',
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
    expect(html).toContain('Unmanaged');
    expect(html).toContain('font-mono text-[12px] font-semibold text-[#6D5B4C]');
    expect(html).toContain('flex items-baseline gap-2 text-[18px] font-semibold');
    expect(html).toContain('mt-0.5 text-[18px] font-semibold');
    expect(html).toContain('type="button"');
    expect(html).toContain('title="Preview benchmark selector"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('cursor-default');
    expect(html).toContain('self-center');
    expect(html).toContain('xl:justify-center');
    expect(html).not.toContain('xl:flex-none');
    expect(html).toContain('xl:gap-x-12');
    expect(html).toContain('xl:grid-cols-[max-content_max-content_max-content_auto]');
    expect(html).not.toContain('>Soon<');
    expect(html).toContain('Selected Benchmark');
    expect(html).toContain('rounded-[20px] border border-[#eadac7] bg-[#fffdf8]/98');
    expect(html).toContain('rounded-b-[24px] rounded-t-none');
    expect(html).toContain('bg-[#FFFCF7]');
    expect(html).not.toContain('bg-[#EFE5DA]');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('group-hover/benchmark:pointer-events-auto');
    expect(html).toContain('group-focus-within/benchmark:pointer-events-auto');
    expect(html).toContain("before:-top-2");
    expect(html).toContain("before:h-2");
    expect(html).toContain('group-hover/benchmark:opacity-100');
    expect(html).toContain('group-focus-within/benchmark:opacity-100');
    expect(html).toContain('Pro Only');
    expect(html).toContain('hover:border-[#E8C9AA]');
    expect(html).toContain('hover:bg-[#FFF7F2]');
    expect(html).not.toContain('Benchmark switching is coming soon.');
    expect(html).toContain(
      'The benchmark is the reference asset you compare this portfolio against to measure performance.',
    );
    expect(html).not.toContain('rounded-[16px] border border-dashed border-[#d8c3ad] bg-[#fffaf2]');
  });
});
