import type { PerpetualPosition } from '../clients/onchainActions.js';
import type { GmxAlloraTelemetry } from '../domain/types.js';

function parseUsd(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTradeAction(action: GmxAlloraTelemetry['action']): action is 'open' | 'reduce' | 'close' {
  return action === 'open' || action === 'reduce' || action === 'close';
}

export function applyExposureLimits(params: {
  telemetry: GmxAlloraTelemetry;
  positions: PerpetualPosition[];
  targetMarketAddress: string;
  maxMarketExposureUsd: number;
  maxTotalExposureUsd: number;
}): GmxAlloraTelemetry {
  const { telemetry, positions } = params;

  if (telemetry.action !== 'open' || !isTradeAction(telemetry.action)) {
    return telemetry;
  }

  const sizeUsd = telemetry.sizeUsd ?? 0;
  if (sizeUsd <= 0) {
    return telemetry;
  }

  const normalizedTarget = params.targetMarketAddress.toLowerCase();
  let marketExposure = 0;
  let totalExposure = 0;

  for (const position of positions) {
    const exposure = parseUsd(position.sizeInUsd);
    totalExposure += exposure;
    if (position.marketAddress.toLowerCase() === normalizedTarget) {
      marketExposure += exposure;
    }
  }

  const nextMarketExposure = marketExposure + sizeUsd;
  const nextTotalExposure = totalExposure + sizeUsd;

  if (
    nextMarketExposure > params.maxMarketExposureUsd ||
    nextTotalExposure > params.maxTotalExposureUsd
  ) {
    const reason = `Exposure limit reached (market ${nextMarketExposure.toFixed(2)} / total ${nextTotalExposure.toFixed(2)}).`;
    return {
      ...telemetry,
      action: 'hold',
      reason,
      side: undefined,
      leverage: undefined,
      sizeUsd: undefined,
      txHash: undefined,
    };
  }

  return telemetry;
}
