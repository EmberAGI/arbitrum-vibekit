import { describe, expect, it } from 'vitest';

import {
  buildPortfolioManagerSetupInput,
  normalizeBlockedFromAgentsQuantityInput,
} from './portfolioManagerSetup';

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
      blockedFromAgentsQuantity: null,
      firstManagedMandate: {
        targetAgentId: 'ember-lending',
        targetAgentKey: 'ember-lending-primary',
        mandateSummary: 'lend USDC through the managed lending lane',
        managedMandate: {
          allocation_basis: 'allocable_idle',
          allowed_assets: ['USDC'],
          asset_intent: {
            root_asset: 'USDC',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            intent: 'deploy',
            control_path: 'lending.supply',
          },
          adapter_context: {
            policy: {
              protocol_system: 'aave',
              allowed_borrow_assets: ['USDC'],
              max_allocation_pct: 35,
              max_ltv_bps: 7500,
              min_health_factor: '1.25',
            },
            data_sources: {
              policy_source: 'portfolio_manager',
              live_scope_projection: 'lending_position_scopes',
            },
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
        blockedFromAgentsQuantity: '125',
      }),
    ).toEqual({
      walletAddress: '0x00000000000000000000000000000000000000a1',
      portfolioMandate: {
        approved: true,
        riskLevel: 'medium',
      },
      blockedFromAgentsQuantity: '125',
      firstManagedMandate: {
        targetAgentId: 'ember-lending',
        targetAgentKey: 'ember-lending-primary',
        mandateSummary: 'lend WETH and USDC through the managed lending lane',
        managedMandate: {
          allocation_basis: 'allocable_idle',
          allowed_assets: ['WETH', 'USDC'],
          asset_intent: {
            root_asset: 'WETH',
            network: 'arbitrum',
            benchmark_asset: 'USD',
            intent: 'deploy',
            control_path: 'lending.supply',
          },
          adapter_context: {
            policy: {
              protocol_system: 'aave',
              allowed_borrow_assets: ['WETH'],
              max_allocation_pct: 35,
              max_ltv_bps: 7500,
              min_health_factor: '1.25',
            },
            data_sources: {
              policy_source: 'portfolio_manager',
              live_scope_projection: 'lending_position_scopes',
            },
          },
        },
      },
    });
  });

  it('normalizes the optional blocked-from-agents quantity', () => {
    expect(normalizeBlockedFromAgentsQuantityInput(undefined)).toBeNull();
    expect(normalizeBlockedFromAgentsQuantityInput('')).toBeNull();
    expect(normalizeBlockedFromAgentsQuantityInput(' 25.50 ')).toBe('25.5');
    expect(normalizeBlockedFromAgentsQuantityInput('-1')).toBeUndefined();
    expect(normalizeBlockedFromAgentsQuantityInput('abc')).toBeUndefined();
  });
});
