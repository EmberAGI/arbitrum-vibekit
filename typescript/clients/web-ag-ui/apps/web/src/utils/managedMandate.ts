export const DEFAULT_MANAGED_MANDATE_ROOT_ASSET = 'USDC';

export function normalizeManagedMandateAssetSymbol(value: string): string {
  return value.trim().toUpperCase();
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

export function canonicalizeManagedMandateAssets(
  rootAsset: string,
  allowedAssets: readonly string[],
): string[] {
  const normalizedRootAsset = normalizeManagedMandateAssetSymbol(rootAsset);
  if (normalizedRootAsset.length === 0) {
    return [...allowedAssets];
  }

  const orderedAssets = [normalizedRootAsset];
  for (const asset of allowedAssets) {
    if (asset === normalizedRootAsset) {
      continue;
    }
    orderedAssets.push(asset);
  }

  return orderedAssets;
}

export function buildManagedMandateSummary(allowedAssets: readonly string[]): string {
  if (allowedAssets.length === 0) {
    return 'lend through the managed lending lane';
  }

  if (allowedAssets.length === 1) {
    return `lend ${allowedAssets[0]} through the managed lending lane`;
  }

  if (allowedAssets.length === 2) {
    return `lend ${allowedAssets[0]} and ${allowedAssets[1]} through the managed lending lane`;
  }

  return `lend ${allowedAssets.slice(0, -1).join(', ')}, and ${
    allowedAssets[allowedAssets.length - 1]
  } through the managed lending lane`;
}
