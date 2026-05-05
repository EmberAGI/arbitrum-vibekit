import type { PortfolioManagerMandateInput, PortfolioManagerSetupInput } from '../types/agent';
import {
  buildManagedLendingPolicy,
  DEFAULT_MANAGED_LENDING_COLLATERAL_ASSET,
  DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
  formatManagedLendingCollateralPolicies,
  parseManagedLendingCollateralPolicies,
  parseManagedMandateAssetList,
} from './managedMandate';

const DEFAULT_PORTFOLIO_MANAGER_SETUP = {
  portfolioMandate: {
    approved: true,
    riskLevel: 'medium',
  },
  portfolioManagerMandate: {} satisfies PortfolioManagerMandateInput,
  firstManagedMandate: {
    targetAgentId: 'ember-lending',
    targetAgentKey: 'ember-lending-primary',
    managedMandate: {
      lending_policy: buildManagedLendingPolicy({
        existingManagedMandate: null,
        collateralPolicies: [
          {
            asset: DEFAULT_MANAGED_LENDING_COLLATERAL_ASSET,
            max_allocation_pct: DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
          },
        ],
        allowedBorrowAssets: [],
      }),
    },
  },
} satisfies Omit<PortfolioManagerSetupInput, 'walletAddress'>;

export function buildPortfolioManagerSetupInput(
  walletAddress: `0x${string}`,
  input: {
    collateralPoliciesInput?: string;
    allowedBorrowAssetsInput?: string;
    maxLtvBps?: number;
    minHealthFactor?: string;
  } = {},
): PortfolioManagerSetupInput {
  const defaultManagedMandate =
    DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.managedMandate;
  const normalizedCollateralPolicies = parseManagedLendingCollateralPolicies(
    input.collateralPoliciesInput ??
      formatManagedLendingCollateralPolicies(
        defaultManagedMandate.lending_policy.collateral_policy.assets,
      ),
  );
  const normalizedAllowedBorrowAssets = parseManagedMandateAssetList(
    input.allowedBorrowAssetsInput ??
      defaultManagedMandate.lending_policy.borrow_policy.allowed_assets.join(', '),
  );

  return {
    walletAddress,
    portfolioMandate: DEFAULT_PORTFOLIO_MANAGER_SETUP.portfolioMandate,
    portfolioManagerMandate: DEFAULT_PORTFOLIO_MANAGER_SETUP.portfolioManagerMandate,
    firstManagedMandate: {
      targetAgentId: DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.targetAgentId,
      targetAgentKey: DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.targetAgentKey,
      managedMandate: {
        lending_policy: buildManagedLendingPolicy({
          existingManagedMandate: defaultManagedMandate,
          collateralPolicies: normalizedCollateralPolicies,
          allowedBorrowAssets: normalizedAllowedBorrowAssets,
          maxLtvBps: input.maxLtvBps,
          minHealthFactor: input.minHealthFactor,
        }),
      },
    },
  };
}
