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
              allocation_basis: 'allocable_idle',
              allowed_assets: ['USDC'],
              asset_intent: {
                root_asset: 'USDC',
                network: 'arbitrum',
                benchmark_asset: 'USD',
                intent: 'position.enter',
                control_path: 'lending.supply',
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
