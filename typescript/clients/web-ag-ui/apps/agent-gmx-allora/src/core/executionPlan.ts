import { parseUnits } from 'viem';

import type { GmxAlloraTelemetry } from '../domain/types.js';

export type ExecutionPlan = {
  action: 'none' | 'long' | 'short' | 'close' | 'reduce';
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
    key?: string;
    sizeDeltaUsd?: string;
  };
};

type BuildPlanParams = {
  telemetry: GmxAlloraTelemetry;
  chainId: string;
  marketAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  payTokenAddress: `0x${string}`;
  collateralTokenAddress: `0x${string}`;
  positionContractKey?: string;
  positionSizeInUsd?: string;
};

function formatNumber(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return String(value);
}

const USDC_DECIMALS = 6;

function toAmountString(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  // onchain-actions expects token base units (e.g., 10 USDC => 10000000).
  const normalized = value.toFixed(USDC_DECIMALS);
  try {
    return parseUnits(normalized, USDC_DECIMALS).toString();
  } catch {
    return undefined;
  }
}

function toGmxUsdDelta(positionSizeInUsd: string | undefined): string | undefined {
  if (!positionSizeInUsd) {
    return undefined;
  }

  let size: bigint;
  try {
    size = BigInt(positionSizeInUsd);
  } catch {
    return undefined;
  }

  if (size <= 0n) {
    return undefined;
  }

  // Deterministic default: reduce by 50% of current notional.
  const delta = size / 2n;
  if (delta <= 0n) {
    return undefined;
  }

  return delta.toString();
}

export function buildPerpetualExecutionPlan(params: BuildPlanParams): ExecutionPlan {
  const { telemetry } = params;

  if (telemetry.action === 'open') {
    if (!telemetry.side || telemetry.sizeUsd === undefined || telemetry.leverage === undefined) {
      return { action: 'none' };
    }

    return {
      action: telemetry.side === 'long' ? 'long' : 'short',
      request: {
        amount: toAmountString(telemetry.sizeUsd),
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

    if (telemetry.action === 'reduce') {
      const key = params.positionContractKey;
      const sizeDeltaUsd = toGmxUsdDelta(params.positionSizeInUsd);
      if (!key || !sizeDeltaUsd) {
        return { action: 'none' };
      }

      return {
        action: 'reduce',
        request: {
          walletAddress: params.walletAddress,
          key,
          sizeDeltaUsd,
        },
      };
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
