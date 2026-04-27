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

    expect(html).toContain('A quiet place before the agents start.');
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('Skip to agents');
  });

  it('renders sign up wallet analysis before onboarding', () => {
    const html = renderToStaticMarkup(React.createElement(SignUpPage));

    expect(html).toContain('Wallet sign up prototype');
    expect(html).toContain('Wallet read');
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

    expect(shapes.map((shape) => shape.title)).toEqual(['Steady carry', 'Barbell growth']);
    expect(html).toContain('Pick the default posture.');
    expect(html).toContain('Use this default');
    expect(html).toContain('/hire-agents/agent-portfolio-manager');
  });

  it('keeps the prototype backend boundary explicit', () => {
    expect(PRE_APP_PROTOTYPE_BACKEND_RULE).toContain('mocked backend adapters only');
    expect(PRE_APP_PROTOTYPE_BACKEND_RULE).toContain('Do not call live wallet');
  });
});
