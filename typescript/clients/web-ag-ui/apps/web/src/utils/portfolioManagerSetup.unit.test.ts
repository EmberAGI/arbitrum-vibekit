import { describe, expect, it } from 'vitest';

import { buildPortfolioManagerSetupInput } from './portfolioManagerSetup';

describe('buildPortfolioManagerSetupInput', () => {
  it('preloads the approved portfolio mandate and a supply-only lending policy for onboarding', () => {
    expect(
      buildPortfolioManagerSetupInput('0x00000000000000000000000000000000000000a1'),
    ).toEqual({
      walletAddress: '0x00000000000000000000000000000000000000a1',
      portfolioMandate: {
        approved: true,
        riskLevel: 'medium',
      },
      firstManagedMandate: {
        targetAgentId: 'ember-lending',
        targetAgentKey: 'ember-lending-primary',
        managedMandate: {
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
              allowed_assets: [],
            },
            risk_policy: {
              max_ltv_bps: 7000,
              min_health_factor: '1.25',
            },
          },
        },
      },
    });
  });

  it('builds a policy-only first managed mandate from per-collateral inputs', () => {
    expect(
      buildPortfolioManagerSetupInput('0x00000000000000000000000000000000000000a1', {
        collateralPoliciesInput: 'weth:60, usdc:25',
        allowedBorrowAssetsInput: 'usdc',
        maxLtvBps: 6500,
        minHealthFactor: '1.4',
      }),
    ).toEqual({
      walletAddress: '0x00000000000000000000000000000000000000a1',
      portfolioMandate: {
        approved: true,
        riskLevel: 'medium',
      },
      firstManagedMandate: {
        targetAgentId: 'ember-lending',
        targetAgentKey: 'ember-lending-primary',
        managedMandate: {
          lending_policy: {
            collateral_policy: {
              assets: [
                {
                  asset: 'WETH',
                  max_allocation_pct: 60,
                },
                {
                  asset: 'USDC',
                  max_allocation_pct: 25,
                },
              ],
            },
            borrow_policy: {
              allowed_assets: ['USDC'],
            },
            risk_policy: {
              max_ltv_bps: 6500,
              min_health_factor: '1.4',
            },
          },
        },
      },
    });
  });
});
