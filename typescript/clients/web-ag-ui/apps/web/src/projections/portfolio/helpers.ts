import type {
  AssetSemanticClass,
  EconomicExposureInput,
  ObservedAssetHoldingState,
  ObservedAssetProjection,
} from './types';

const FAMILY_ASSET_ALIASES = new Map<string, string>([['WETH', 'ETH']]);

export function parseQuantity(value: string | undefined | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatAgentLabel(agentId: string): string {
  const normalized = agentId.replace(/^agent-/, '');

  return normalized
    .split(/[\s._-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function deriveFamilyAsset(input: {
  asset: string;
  economicExposures?: EconomicExposureInput[];
}): string {
  const directFamilyAsset = FAMILY_ASSET_ALIASES.get(input.asset.trim().toUpperCase());
  if (directFamilyAsset) {
    return directFamilyAsset;
  }

  const uniqueExposureAssets = Array.from(
    new Set(
      (input.economicExposures ?? []).map(
        (exposure) =>
          FAMILY_ASSET_ALIASES.get(exposure.asset.trim().toUpperCase()) ?? exposure.asset,
      ),
    ),
  );

  if (uniqueExposureAssets.length === 1) {
    return uniqueExposureAssets[0] ?? input.asset;
  }

  return input.asset;
}

export function normalizeBenchmarkAssetToCashFamily(benchmarkAsset: string): string {
  return benchmarkAsset === 'USD' ? 'USDC' : benchmarkAsset;
}

export function formatProtocolLabel(protocolSystem: string): string {
  return protocolSystem
    .split(/[\s._-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function classifyObservedAssetSemantic(input: {
  observedAsset: Pick<
    ObservedAssetProjection,
    'asset' | 'familyAsset' | 'sourceKind' | 'protocolSystem'
  >;
  cashFamilyAsset?: string;
}): {
  semanticClass: AssetSemanticClass;
  holdingState: ObservedAssetHoldingState;
  protocolLabel?: string;
  statusLabel?: string;
} {
  const protocolLabel = input.observedAsset.protocolSystem
    ? formatProtocolLabel(input.observedAsset.protocolSystem)
    : undefined;

  if (input.observedAsset.sourceKind === 'debt') {
    return {
      semanticClass: 'liability',
      holdingState: 'liability',
      protocolLabel,
      statusLabel: protocolLabel ? `owed on ${protocolLabel}` : undefined,
    };
  }

  if (input.observedAsset.sourceKind === 'position') {
    return {
      semanticClass: 'asset',
      holdingState: 'deployed',
      protocolLabel,
      statusLabel: protocolLabel ? `deployed to ${protocolLabel}` : undefined,
    };
  }

  const semanticClass =
    input.cashFamilyAsset !== undefined &&
    input.observedAsset.asset === input.observedAsset.familyAsset &&
    input.observedAsset.familyAsset === input.cashFamilyAsset
      ? 'cash'
      : 'asset';

  return {
    semanticClass,
    holdingState: 'in_wallet',
    protocolLabel,
  };
}

export function classifyAssetFamilySemantic(input: {
  asset: string;
  positiveUsd: number;
  debtUsd: number;
  walletAvailableUsd: number;
  cashFamilyAsset?: string;
}): AssetSemanticClass {
  if (input.positiveUsd <= 0 && input.debtUsd > 0) {
    return 'liability';
  }

  if (
    input.cashFamilyAsset !== undefined &&
    input.asset === input.cashFamilyAsset &&
    input.walletAvailableUsd > 0
  ) {
    return 'cash';
  }

  return 'asset';
}
