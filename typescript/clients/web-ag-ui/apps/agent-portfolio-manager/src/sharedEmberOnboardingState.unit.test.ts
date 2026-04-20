import { describe, expect, it } from 'vitest';

import { resolvePortfolioManagerAccountingAgentId } from './sharedEmberOnboardingState.js';

describe('resolvePortfolioManagerAccountingAgentId', () => {
  it('uses the activated durable managed mandate when onboarding names a mandate ref', () => {
    expect(
      resolvePortfolioManagerAccountingAgentId({
        mandates: [
          {
            mandate_ref: 'mandate-portfolio-001',
            agent_id: 'portfolio-manager',
            managed_mandate: null,
          },
          {
            mandate_ref: 'mandate-ember-lending-001',
            agent_id: 'ember-lending',
            managed_mandate: {
              lending_policy: {
                collateral_policy: {
                  assets: [
                    {
                      asset: 'USDC',
                      max_allocation_pct: 35,
                    },
                  ],
                },
                borrow_policy: {
                  allowed_assets: ['USDC'],
                },
                risk_policy: {
                  max_ltv_bps: 7000,
                  min_health_factor: '1.25',
                },
              },
            },
          },
        ],
        activation: {
          mandateRef: 'mandate-ember-lending-001',
        },
      }),
    ).toBe('ember-lending');
  });
});
