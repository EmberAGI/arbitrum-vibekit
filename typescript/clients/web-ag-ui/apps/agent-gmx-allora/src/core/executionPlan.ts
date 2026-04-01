import { parseUnits } from 'viem';

import type {
  PerpetualCloseRequest,
  PerpetualLongRequest,
  PerpetualReduceRequest,
  PerpetualShortRequest,
} from '../clients/onchainActions.js';
import type { GmxAlloraTelemetry } from '../domain/types.js';

type PerpetualOpenRequest = PerpetualLongRequest;

export type ExecutionPlan =
  | { action: 'none' }
  | { action: 'long'; request: PerpetualLongRequest }
  | { action: 'short'; request: PerpetualShortRequest }
  | { action: 'close'; request: PerpetualCloseRequest }
  | { action: 'reduce'; request: PerpetualReduceRequest }
  | {
      action: 'flip';
      closeRequest: PerpetualCloseRequest;
      openRequest: PerpetualOpenRequest;
    };

type BuildPlanParams = {
  telemetry: GmxAlloraTelemetry;
  txExecutionMode: 'plan' | 'execute';
  chainId: string;
  marketAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  payTokenAddress: `0x${string}`;
  collateralTokenAddress: `0x${string}`;
  actualPositionSide?: 'long' | 'short';
  assumedPositionSide?: 'long' | 'short';
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

function buildOpenRequest(params: BuildPlanParams): PerpetualOpenRequest | undefined {
  const { telemetry } = params;
  if (!telemetry.side || telemetry.sizeUsd === undefined || telemetry.leverage === undefined) {
    return undefined;
  }
  const amount = toAmountString(telemetry.sizeUsd);
  const leverage = formatNumber(telemetry.leverage);
  if (!amount || !leverage) {
    return undefined;
  }

  return {
    amount,
    walletAddress: params.walletAddress,
    chainId: params.chainId,
    marketAddress: params.marketAddress,
    payTokenAddress: params.payTokenAddress,
    collateralTokenAddress: params.collateralTokenAddress,
    leverage,
  };
}

export function buildPerpetualExecutionPlan(params: BuildPlanParams): ExecutionPlan {
  const { telemetry } = params;

  if (telemetry.action === 'open') {
    const request = buildOpenRequest(params);
    if (!telemetry.side || !request?.amount) {
      return { action: 'none' };
    }

    return {
      action: telemetry.side === 'long' ? 'long' : 'short',
      request,
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

    const priorPositionSide = params.actualPositionSide ?? params.assumedPositionSide;
    const openRequest = buildOpenRequest(params);
    const shouldDirectPlanFlipOpen =
      params.txExecutionMode === 'plan' &&
      params.actualPositionSide === undefined &&
      params.assumedPositionSide !== undefined &&
      telemetry.side !== params.assumedPositionSide &&
      openRequest?.amount !== undefined;
    if (shouldDirectPlanFlipOpen && openRequest) {
      return {
        action: telemetry.side === 'long' ? 'long' : 'short',
        request: openRequest,
      };
    }

    const closeRequest: PerpetualCloseRequest = {
      walletAddress: params.walletAddress,
      marketAddress: params.marketAddress,
      positionSide: priorPositionSide ?? telemetry.side,
      isLimit: false,
    };
    const nextPositionSide = telemetry.side;
    const shouldFlip =
      priorPositionSide !== undefined &&
      nextPositionSide !== priorPositionSide &&
      openRequest?.amount !== undefined;
    if (shouldFlip && openRequest) {
      return {
        action: 'flip',
        closeRequest,
        openRequest,
      };
    }

    return {
      action: 'close',
      request: closeRequest,
    };
  }

  return { action: 'none' };
}
