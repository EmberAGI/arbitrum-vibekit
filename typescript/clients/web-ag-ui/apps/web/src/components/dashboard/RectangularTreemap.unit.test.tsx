import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RectangularTreemap } from './RectangularTreemap';

describe('RectangularTreemap', () => {
  it('renders on a transparent unframed root instead of a black backdrop', () => {
    const html = renderToStaticMarkup(
      React.createElement(RectangularTreemap, {
        items: [
          {
            id: 'treemap:usdc',
            label: 'USDC',
            value: 100,
            valueLabel: '$100.00',
            shareLabel: '100%',
            toneStyle: { background: '#178B5D', color: '#F8FAFC' },
          },
        ],
      }),
    );

    expect(html).toContain('bg-transparent');
    expect(html).not.toContain('bg-[#0B0B0B]');
    expect(html).not.toContain('border border-[#E7DBD0]');
  });

  it('keeps treemap boxes barely rounded', () => {
    const html = renderToStaticMarkup(
      React.createElement(RectangularTreemap, {
        items: [
          {
            id: 'treemap:usdc',
            label: 'USDC',
            value: 100,
            valueLabel: '$100.00',
            shareLabel: '100%',
            toneStyle: { background: '#178B5D', color: '#F8FAFC' },
          },
        ],
      }),
    );

    expect(html).toContain('rounded-[4px]');
    expect(html).toContain('rounded-[3px]');
    expect(html).not.toContain('rounded-[20px]');
    expect(html).not.toContain('rounded-[18px]');
    expect(html).not.toContain('rounded-[16px]');
  });

  it('trims token value spacing by one third', () => {
    const html = renderToStaticMarkup(
      React.createElement(RectangularTreemap, {
        items: [
          {
            id: 'treemap:usdc',
            label: 'USDC',
            value: 100,
            valueLabel: '$100.00',
            shareLabel: '100%',
            toneStyle: { background: '#178B5D', color: '#F8FAFC' },
          },
        ],
      }),
    );

    expect(html).toContain('padding-inline:6.666666666666666px');
    expect(html).toContain('padding-block:5.333333333333333px');
    expect(html).toContain('gap:2.6666666666666665px');
    expect(html).not.toContain('padding-inline:10px');
    expect(html).not.toContain('padding-block:8px');
    expect(html).not.toContain('gap:4px');
  });
});
