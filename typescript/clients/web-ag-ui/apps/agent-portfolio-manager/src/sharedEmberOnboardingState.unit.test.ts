import { describe, expect, it } from 'vitest';

import { resolvePortfolioManagerAccountingAgentId } from './sharedEmberOnboardingState.js';

describe('resolvePortfolioManagerAccountingAgentId', () => {
  it('keeps legacy bootstrap payloads on the activated managed agent when managed_onboarding is absent', () => {
    expect(
      resolvePortfolioManagerAccountingAgentId({
        mandates: [
          {
            mandate_ref: 'mandate-portfolio-001',
            agent_id: 'portfolio-manager',
          },
          {
            mandate_ref: 'mandate-ember-lending-001',
            agent_id: 'ember-lending',
          },
        ],
        activation: {
          agentId: 'ember-lending',
        },
      }),
    ).toBe('ember-lending');
  });
});
