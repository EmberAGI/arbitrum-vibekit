import type {
  ManagedLendingCollateralAssetPolicyInput,
  ManagedMandateInput,
} from '../types/agent';

export const DEFAULT_MANAGED_LENDING_COLLATERAL_ASSET = 'USDC';
export const DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT = 35;
export const DEFAULT_MANAGED_LENDING_MAX_LTV_BPS = 7000;
export const DEFAULT_MANAGED_LENDING_MIN_HEALTH_FACTOR = '1.25';

export function normalizeManagedMandateAssetSymbol(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function parseManagedMandateAssetList(value: string): string[] {
  const normalizedAssets: string[] = [];
  const seen = new Set<string>();

  for (const rawAsset of value.split(',')) {
    const asset = normalizeManagedMandateAssetSymbol(rawAsset);
    if (asset.length === 0 || seen.has(asset)) {
      continue;
    }
    seen.add(asset);
    normalizedAssets.push(asset);
  }

  return normalizedAssets;
}

export function parseManagedLendingCollateralPolicies(
  value: string,
  fallbackMaxAllocationPct = DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
): ManagedLendingCollateralAssetPolicyInput[] {
  const normalizedPolicies: ManagedLendingCollateralAssetPolicyInput[] = [];
  const seen = new Set<string>();

  for (const rawPolicy of value.split(',')) {
    const [rawAsset, rawMaxAllocationPct] = rawPolicy.split(':', 2);
    const asset = normalizeManagedMandateAssetSymbol(rawAsset ?? '');
    if (asset.length === 0 || seen.has(asset)) {
      continue;
    }

    const parsedMaxAllocationPct =
      rawMaxAllocationPct === undefined || rawMaxAllocationPct.trim().length === 0
        ? fallbackMaxAllocationPct
        : Number(rawMaxAllocationPct.trim());
    if (!Number.isFinite(parsedMaxAllocationPct)) {
      continue;
    }

    seen.add(asset);
    normalizedPolicies.push({
      asset,
      max_allocation_pct: parsedMaxAllocationPct,
    });
  }

  return normalizedPolicies;
}

export function formatManagedLendingCollateralPolicies(
  policies: readonly ManagedLendingCollateralAssetPolicyInput[],
): string {
  return policies.map((policy) => `${policy.asset}:${policy.max_allocation_pct}`).join(', ');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readManagedLendingCollateralPolicies(
  managedMandate: Record<string, unknown> | null,
): ManagedLendingCollateralAssetPolicyInput[] {
  const lendingPolicy = asRecord(managedMandate?.['lending_policy']);
  const collateralPolicy = asRecord(lendingPolicy?.['collateral_policy']);
  const assets = Array.isArray(collateralPolicy?.['assets']) ? collateralPolicy['assets'] : [];
  const normalizedPolicies: ManagedLendingCollateralAssetPolicyInput[] = [];
  const seen = new Set<string>();

  for (const rawAssetPolicy of assets) {
    const assetPolicy = asRecord(rawAssetPolicy);
    const asset = normalizeManagedMandateAssetSymbol(readString(assetPolicy?.['asset']) ?? '');
    const maxAllocationPct = readNumber(assetPolicy?.['max_allocation_pct']);
    if (asset.length === 0 || maxAllocationPct === null || seen.has(asset)) {
      continue;
    }

    seen.add(asset);
    normalizedPolicies.push({
      asset,
      max_allocation_pct: maxAllocationPct,
    });
  }

  return normalizedPolicies;
}

export function readManagedLendingBorrowAssets(
  managedMandate: Record<string, unknown> | null,
): string[] {
  const lendingPolicy = asRecord(managedMandate?.['lending_policy']);
  const borrowPolicy = asRecord(lendingPolicy?.['borrow_policy']);
  const allowedAssets = Array.isArray(borrowPolicy?.['allowed_assets'])
    ? borrowPolicy['allowed_assets']
    : [];
  const normalizedAssets: string[] = [];
  const seen = new Set<string>();

  for (const rawAsset of allowedAssets) {
    const asset = normalizeManagedMandateAssetSymbol(readString(rawAsset));
    if (asset.length === 0 || seen.has(asset)) {
      continue;
    }

    seen.add(asset);
    normalizedAssets.push(asset);
  }

  return normalizedAssets;
}

export function readManagedLendingRiskPolicy(
  managedMandate: Record<string, unknown> | null,
) {
  const lendingPolicy = asRecord(managedMandate?.['lending_policy']);
  const riskPolicy = asRecord(lendingPolicy?.['risk_policy']);

  return {
    maxLtvBps:
      readNumber(riskPolicy?.['max_ltv_bps']) ?? DEFAULT_MANAGED_LENDING_MAX_LTV_BPS,
    minHealthFactor:
      readString(riskPolicy?.['min_health_factor']) ??
      DEFAULT_MANAGED_LENDING_MIN_HEALTH_FACTOR,
  };
}

export function buildManagedLendingPolicy(input: {
  existingManagedMandate: Record<string, unknown> | null;
  collateralPolicies: readonly ManagedLendingCollateralAssetPolicyInput[];
  allowedBorrowAssets: readonly string[];
  maxLtvBps?: number;
  minHealthFactor?: string;
}): ManagedMandateInput['lending_policy'] {
  const existingCollateralPolicies = readManagedLendingCollateralPolicies(
    input.existingManagedMandate,
  );
  const fallbackCollateralPolicies =
    existingCollateralPolicies.length > 0
      ? existingCollateralPolicies
      : [
          {
            asset: DEFAULT_MANAGED_LENDING_COLLATERAL_ASSET,
            max_allocation_pct: DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
          },
        ];
  const riskPolicy = readManagedLendingRiskPolicy(input.existingManagedMandate);
  const collateralPolicies =
    input.collateralPolicies.length > 0 ? input.collateralPolicies : fallbackCollateralPolicies;

  return {
    collateral_policy: {
      assets: collateralPolicies.map((policy) => ({
        asset: policy.asset,
        max_allocation_pct: policy.max_allocation_pct,
      })),
    },
    borrow_policy: {
      allowed_assets: [...input.allowedBorrowAssets],
    },
    risk_policy: {
      max_ltv_bps: input.maxLtvBps ?? riskPolicy.maxLtvBps,
      min_health_factor: input.minHealthFactor ?? riskPolicy.minHealthFactor,
    },
  };
}
