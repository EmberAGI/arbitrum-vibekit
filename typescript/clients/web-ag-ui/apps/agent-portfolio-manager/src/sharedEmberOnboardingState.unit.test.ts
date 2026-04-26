import { describe, expect, it } from 'vitest';

import {
  buildPortfolioManagerWalletAccountingDetails,
  buildSharedEmberAccountingContextXml,
  resolvePortfolioManagerAccountingAgentId,
} from './sharedEmberOnboardingState.js';

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

  it('includes display quantities in the Shared Ember accounting context', () => {
    const details = buildPortfolioManagerWalletAccountingDetails({
      revision: 10,
      onboardingState: {
        wallet_address: '0x00000000000000000000000000000000000000a1',
        network: 'arbitrum',
        phase: 'active',
        proofs: {
          rooted_wallet_context_registered: true,
          root_delegation_registered: true,
          root_authority_active: true,
          wallet_baseline_observed: true,
          accounting_units_seeded: true,
          mandate_inputs_configured: true,
          reserve_policy_configured: true,
          capital_reserved_for_agent: true,
          policy_snapshot_recorded: true,
          agent_active: true,
        },
        owned_units: [
          {
            unit_id: 'unit-wbtc-ingress-a1',
            root_asset: 'WBTC',
            quantity: '2792',
            status: 'free',
            control_path: 'unassigned',
            reservation_id: null,
          },
        ],
        reservations: [],
      },
    });

    expect(details.assets).toMatchObject([
      {
        asset: 'WBTC',
        quantity: '2792',
        displayQuantity: '0.00002792',
      },
    ]);
    expect(
      buildSharedEmberAccountingContextXml({
        status: 'live',
        details,
      }).join('\n'),
    ).toContain('<display_quantity>0.00002792</display_quantity>');
  });
});
