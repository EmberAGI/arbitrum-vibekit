import type { GmxAlloraTelemetry } from '../domain/types.js';

export type ExecutionPlan = {
  action: 'none' | 'long' | 'short' | 'close';
  request?: {
    amount?: string;
    walletAddress?: `0x${string}`;
    chainId?: string;
    marketAddress?: string;
    payTokenAddress?: string;
    collateralTokenAddress?: string;
    leverage?: string;
    positionSide?: 'long' | 'short';
    isLimit?: boolean;
  };
};

type BuildPlanParams = {
  telemetry: GmxAlloraTelemetry;
  chainId: string;
  marketAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  payTokenAddress: `0x${string}`;
  payTokenDecimals: number;
  collateralTokenAddress: `0x${string}`;
};

function formatNumber(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return String(value);
}

function toBaseUnitAmount(value: number | undefined, decimals: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(decimals) || decimals < 0) {
    return undefined;
  }
  // `sizeUsd` is represented with cents precision; convert to a base-unit bigint string
  // (e.g. USDC has 6 decimals, so $1.00 => "1000000").
  const fixed = value.toFixed(2);
  const [wholeRaw, fracRaw = ''] = fixed.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/u, '');
  const frac = (fracRaw + '00').slice(0, 2);

  if (!/^\d+$/u.test(whole) || !/^\d{2}$/u.test(frac)) {
    return undefined;
  }

  const scale = decimals - 2;
  if (scale < 0) {
    // We need at least 2 decimals of precision to represent cents.
    return undefined;
  }

  const base = `${whole}${frac}${'0'.repeat(scale)}`;
  const normalized = base.replace(/^0+(?=\d)/u, '');

  if (normalized === '0') {
    return undefined;
  }
  return normalized;
}

export function buildPerpetualExecutionPlan(params: BuildPlanParams): ExecutionPlan {
  const { telemetry } = params;

  if (telemetry.action === 'open') {
    if (!telemetry.side || telemetry.sizeUsd === undefined || telemetry.leverage === undefined) {
      return { action: 'none' };
    }

    const amount = toBaseUnitAmount(telemetry.sizeUsd, params.payTokenDecimals);
    if (!amount) {
      return { action: 'none' };
    }

    return {
      action: telemetry.side === 'long' ? 'long' : 'short',
      request: {
        amount,
        walletAddress: params.walletAddress,
        chainId: params.chainId,
        marketAddress: params.marketAddress,
        payTokenAddress: params.payTokenAddress,
        collateralTokenAddress: params.collateralTokenAddress,
        leverage: formatNumber(telemetry.leverage),
      },
    };
  }

  if (telemetry.action === 'reduce' || telemetry.action === 'close') {
    if (!telemetry.side) {
      return { action: 'none' };
    }

    return {
      action: 'close',
      request: {
        walletAddress: params.walletAddress,
        marketAddress: params.marketAddress,
        positionSide: telemetry.side,
        isLimit: false,
      },
    };
  }

  return { action: 'none' };
}
