import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SimpleMarkdownText, parseSimpleMarkdownInline } from './SimpleMarkdownText';

describe('SimpleMarkdownText', () => {
  it('renders basic inline markdown without using raw HTML', () => {
    const html = renderToStaticMarkup(
      React.createElement(SimpleMarkdownText, {
        text: 'Use **reserved WETH**, keep *unassigned* funds, and pass `amount`.',
      }),
    );

    expect(html).toContain('<strong');
    expect(html).toContain('reserved WETH');
    expect(html).toContain('<em');
    expect(html).toContain('unassigned');
    expect(html).toContain('<code');
    expect(html).toContain('amount');
    expect(html).not.toContain('**reserved WETH**');
    expect(html).not.toContain('*unassigned*');
  });

  it('leaves unmatched delimiters readable as plain text', () => {
    expect(parseSimpleMarkdownInline('keep **literal')).toEqual([
      { type: 'text', text: 'keep ' },
      { type: 'text', text: '**' },
      { type: 'text', text: 'literal' },
    ]);
  });

  it('escapes html-like user content while still applying markdown spans', () => {
    const html = renderToStaticMarkup(
      React.createElement(SimpleMarkdownText, {
        text: '<script>alert(1)</script> **safe**',
      }),
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<strong');
    expect(html).toContain('safe');
  });
});
