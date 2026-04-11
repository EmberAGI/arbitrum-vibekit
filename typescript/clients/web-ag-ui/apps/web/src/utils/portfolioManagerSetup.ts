import type { PortfolioManagerSetupInput } from '../types/agent';
import {
  buildManagedMandateSummary,
  canonicalizeManagedMandateAssets,
  DEFAULT_MANAGED_MANDATE_ROOT_ASSET,
  normalizeManagedMandateAssetSymbol,
  parseManagedMandateAssetList,
} from './managedMandate';

const DEFAULT_MANAGED_LENDING_POLICY = {
  protocol_system: 'aave',
  max_allocation_pct: 35,
  max_ltv_bps: 7500,
  min_health_factor: '1.25',
} as const;

const DEFAULT_MANAGED_LENDING_DATA_SOURCES = {
  policy_source: 'portfolio_manager',
  live_scope_projection: 'lending_position_scopes',
} as const;

export function buildManagedLendingAdapterContext(
  rootAsset: string = DEFAULT_MANAGED_MANDATE_ROOT_ASSET,
): PortfolioManagerSetupInput['firstManagedMandate']['managedMandate']['adapter_context'] {
  return {
    policy: {
      protocol_system: DEFAULT_MANAGED_LENDING_POLICY.protocol_system,
      allowed_borrow_assets: [rootAsset],
      max_allocation_pct: DEFAULT_MANAGED_LENDING_POLICY.max_allocation_pct,
      max_ltv_bps: DEFAULT_MANAGED_LENDING_POLICY.max_ltv_bps,
      min_health_factor: DEFAULT_MANAGED_LENDING_POLICY.min_health_factor,
    },
    data_sources: {
      policy_source: DEFAULT_MANAGED_LENDING_DATA_SOURCES.policy_source,
      live_scope_projection: DEFAULT_MANAGED_LENDING_DATA_SOURCES.live_scope_projection,
    },
  };
}

export function normalizeBlockedFromAgentsQuantityInput(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return undefined;
  }

  return String(parsedValue);
}

const DEFAULT_PORTFOLIO_MANAGER_SETUP = {
  portfolioMandate: {
    approved: true,
    riskLevel: 'medium',
  },
  blockedFromAgentsQuantity: null,
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
      adapter_context: buildManagedLendingAdapterContext(DEFAULT_MANAGED_MANDATE_ROOT_ASSET),
    },
  },
} satisfies Omit<PortfolioManagerSetupInput, 'walletAddress'>;

export function buildPortfolioManagerSetupInput(
  walletAddress: `0x${string}`,
  input: {
    rootAsset?: string;
    allowedAssetsInput?: string;
    blockedFromAgentsQuantity?: string | null;
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
  const blockedFromAgentsQuantity = normalizeBlockedFromAgentsQuantityInput(
    input.blockedFromAgentsQuantity,
  );

  if (blockedFromAgentsQuantity === undefined) {
    throw new Error('Blocked from agents must be a valid non-negative number.');
  }

  return {
    walletAddress,
    portfolioMandate: DEFAULT_PORTFOLIO_MANAGER_SETUP.portfolioMandate,
    blockedFromAgentsQuantity,
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
        adapter_context: buildManagedLendingAdapterContext(normalizedRootAsset),
      },
    },
  };
}
