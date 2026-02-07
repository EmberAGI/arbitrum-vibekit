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
  collateralTokenAddress: `0x${string}`;
};

function formatNumber(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return String(value);
}

function toAmountString(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded <= 0) {
    return undefined;
  }
  return String(rounded);
}

export function buildPerpetualExecutionPlan(params: BuildPlanParams): ExecutionPlan {
  const { telemetry } = params;

  if (telemetry.action === 'open') {
    if (!telemetry.side || telemetry.sizeUsd === undefined || telemetry.leverage === undefined) {
      return { action: 'none' };
    }

    const amount = toAmountString(telemetry.sizeUsd);
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
