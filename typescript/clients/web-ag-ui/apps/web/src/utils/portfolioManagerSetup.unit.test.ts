import { describe, expect, it } from 'vitest';

import { buildPortfolioManagerSetupInput } from './portfolioManagerSetup';

describe('buildPortfolioManagerSetupInput', () => {
  it('preloads the approved portfolio mandate and first lending mandate for onboarding', () => {
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
        mandateSummary: 'lend USDC through the managed lending lane',
        managedMandate: {
          allocation_basis: 'allocable_idle',
          allowed_assets: ['USDC'],
          asset_intent: {
            root_asset: 'USDC',
            protocol_system: 'aave',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            intent: 'position.enter',
            control_path: 'lending.supply',
          },
        },
      },
    });
  });

  it('canonicalizes the first managed mandate with the root asset first', () => {
    expect(
      buildPortfolioManagerSetupInput('0x00000000000000000000000000000000000000a1', {
        rootAsset: 'weth',
        allowedAssetsInput: 'usdc, weth',
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
        mandateSummary: 'lend WETH and USDC through the managed lending lane',
        managedMandate: {
          allocation_basis: 'allocable_idle',
          allowed_assets: ['WETH', 'USDC'],
          asset_intent: {
            root_asset: 'WETH',
            protocol_system: 'aave',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            intent: 'position.enter',
            control_path: 'lending.supply',
          },
        },
      },
    });
  });
});
