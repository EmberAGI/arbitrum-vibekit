import type { PortfolioManagerSetupInput } from '../types/agent';
import {
  buildManagedMandateSummary,
  canonicalizeManagedMandateAssets,
  DEFAULT_MANAGED_MANDATE_ROOT_ASSET,
  normalizeManagedMandateAssetSymbol,
  parseManagedMandateAssetList,
} from './managedMandate';

const DEFAULT_PORTFOLIO_MANAGER_SETUP = {
  portfolioMandate: {
    approved: true,
    riskLevel: 'medium',
  },
  firstManagedMandate: {
    targetAgentId: 'ember-lending',
    targetAgentKey: 'ember-lending-primary',
    mandateSummary: buildManagedMandateSummary([DEFAULT_MANAGED_MANDATE_ROOT_ASSET]),
    managedMandate: {
      allocation_basis: 'allocable_idle',
      allowed_assets: [DEFAULT_MANAGED_MANDATE_ROOT_ASSET],
      asset_intent: {
        root_asset: DEFAULT_MANAGED_MANDATE_ROOT_ASSET,
        network: 'arbitrum',
        benchmark_asset: 'USD',
        intent: 'deploy',
        control_path: 'lending.supply',
      },
    },
  },
} satisfies Omit<PortfolioManagerSetupInput, 'walletAddress'>;

export function buildPortfolioManagerSetupInput(
  walletAddress: `0x${string}`,
  input: {
    rootAsset?: string;
    allowedAssetsInput?: string;
  } = {},
): PortfolioManagerSetupInput {
  const normalizedRootAsset = normalizeManagedMandateAssetSymbol(
    input.rootAsset ?? DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.managedMandate.asset_intent.root_asset,
  );
  const parsedAllowedAssets = parseManagedMandateAssetList(
    input.allowedAssetsInput ??
      DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.managedMandate.allowed_assets.join(', '),
  );
  const normalizedAllowedAssets = canonicalizeManagedMandateAssets(
    normalizedRootAsset,
    parsedAllowedAssets,
  );

  return {
    walletAddress,
    portfolioMandate: DEFAULT_PORTFOLIO_MANAGER_SETUP.portfolioMandate,
    firstManagedMandate: {
      targetAgentId: DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.targetAgentId,
      targetAgentKey: DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.targetAgentKey,
      mandateSummary: buildManagedMandateSummary(normalizedAllowedAssets),
      managedMandate: {
        allocation_basis: DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.managedMandate.allocation_basis,
        allowed_assets: normalizedAllowedAssets,
        asset_intent: {
          root_asset: normalizedRootAsset,
          network:
            DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.managedMandate.asset_intent.network,
          benchmark_asset:
            DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.managedMandate.asset_intent.benchmark_asset,
          intent:
            DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.managedMandate.asset_intent.intent,
          control_path:
            DEFAULT_PORTFOLIO_MANAGER_SETUP.firstManagedMandate.managedMandate.asset_intent.control_path,
        },
      },
    },
  };
}
