import type { PortfolioManagerSetupInput } from '../types/agent';

const DEFAULT_PORTFOLIO_MANAGER_SETUP = {
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
} satisfies Omit<PortfolioManagerSetupInput, 'walletAddress'>;

export function buildPortfolioManagerSetupInput(
  walletAddress: `0x${string}`,
): PortfolioManagerSetupInput {
  return {
    walletAddress,
    portfolioMandate: DEFAULT_PORTFOLIO_MANAGER_SETUP.portfolioMandate,
    managedAgentMandates: DEFAULT_PORTFOLIO_MANAGER_SETUP.managedAgentMandates,
  };
}
