import { formatUnits } from 'viem';

const TOKEN_DECIMALS_BY_ASSET = new Map<string, number>([
  ['ETH', 18],
  ['WETH', 18],
  ['USDC', 6],
  ['USDCN', 6],
  ['USDT', 6],
  ['WBTC', 8],
]);

function normalizeAssetForDisplayDecimals(asset: string): string {
  const upperAsset = asset.toUpperCase();
  if (upperAsset.startsWith('AARB')) {
    return upperAsset.slice('AARB'.length);
  }
  if (upperAsset.startsWith('VARIABLEDEBT')) {
    return upperAsset.slice('VARIABLEDEBT'.length);
  }
  if (upperAsset.startsWith('STABLEDEBT')) {
    return upperAsset.slice('STABLEDEBT'.length);
  }
  return upperAsset;
}

export function buildTokenDisplayQuantity(input: {
  asset: string;
  quantity: string;
  explicitDisplayQuantity?: string | null;
}): string | undefined {
  if (input.explicitDisplayQuantity) {
    return input.explicitDisplayQuantity;
  }

  if (!/^\d+$/.test(input.quantity)) {
    return input.quantity;
  }

  const decimals = TOKEN_DECIMALS_BY_ASSET.get(normalizeAssetForDisplayDecimals(input.asset));
  return decimals === undefined ? undefined : formatUnits(BigInt(input.quantity), decimals);
}

export function formatTokenQuantityForAgentSummary(input: {
  asset: string;
  quantity: string;
}): string {
  const displayQuantity = buildTokenDisplayQuantity(input);

  if (displayQuantity === undefined) {
    return `${input.quantity} ${input.asset}`;
  }

  if (/^\d+$/.test(input.quantity) && displayQuantity !== input.quantity) {
    return `${displayQuantity} ${input.asset} (${input.quantity} base units)`;
  }

  return `${displayQuantity} ${input.asset}`;
}
