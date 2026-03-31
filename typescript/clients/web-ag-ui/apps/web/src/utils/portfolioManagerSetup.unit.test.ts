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
      managedAgentMandates: [
        {
          agentKey: 'ember-lending-primary',
          agentType: 'ember-lending',
          approved: true,
          settings: {
            network: 'arbitrum',
            protocol: 'aave',
            allowedCollateralAssets: ['USDC'],
            allowedBorrowAssets: ['USDC'],
            maxAllocationPct: 35,
            maxLtvBps: 7000,
            minHealthFactor: '1.25',
          },
        },
      ],
    });
  });
});
