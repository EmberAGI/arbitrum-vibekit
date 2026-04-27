import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HomePage from './page';
import SignUpPage from './sign-up/page';
import { PreAppOnboardingPrototype } from '@/components/pre-app/PreAppOnboardingPrototype';
import {
  analyzeMockWallet,
  PRE_APP_PROTOTYPE_BACKEND_RULE,
  recommendMockPortfolioShapes,
} from '@/prototypes/preAppMockBackend';

describe('pre-app prototype pages', () => {
  it('renders a calm home instead of redirecting directly to agents', () => {
    const html = renderToStaticMarkup(React.createElement(HomePage));

    expect(html).toContain('Make the wallet work before you sell.');
    expect(html).toContain('Make');
    expect(html).toContain('Save');
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('Skip to agents');
  });

  it('renders sign up wallet analysis before onboarding', () => {
    const html = renderToStaticMarkup(React.createElement(SignUpPage));

    expect(html).toContain('Money in, money protected');
    expect(html).toContain('Wallet read');
    expect(html).toContain('First savings angle');
    expect(html).toContain('Continue');
  });

  it('renders portfolio shapes from wallet analysis and risk posture', () => {
    const analysis = analyzeMockWallet('0x1111111111111111111111111111111111111111');
    const shapes = recommendMockPortfolioShapes(analysis, 'bullish');
    const html = renderToStaticMarkup(
      React.createElement(PreAppOnboardingPrototype, {
        walletAddress: analysis.walletAddress,
      }),
    );

    expect(shapes.map((shape) => shape.title)).toEqual([
      'Yield and preserve',
      'Borrow and compound',
    ]);
    expect(html).toContain('Choose how your wallet starts making money.');
    expect(html).toContain('Use this money plan');
    expect(html).toContain('/hire-agents/agent-portfolio-manager');
  });

  it('keeps the prototype backend boundary explicit', () => {
    expect(PRE_APP_PROTOTYPE_BACKEND_RULE).toContain('mocked backend adapters only');
    expect(PRE_APP_PROTOTYPE_BACKEND_RULE).toContain('Do not call live wallet');
  });
});
