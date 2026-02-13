import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LoadingValue } from './LoadingValue';

describe('LoadingValue', () => {
  it('renders a skeleton until loaded', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingValue, {
        isLoaded: false,
        value: '123',
        skeletonClassName: 'h-4 w-10',
      }),
    );

    expect(html).toContain('animate-pulse');
  });

  it('renders a hyphen when loaded but missing', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoadingValue, {
        isLoaded: true,
        value: null,
        skeletonClassName: 'h-4 w-10',
      }),
    );

    expect(html).toContain('>-<');
  });
});

