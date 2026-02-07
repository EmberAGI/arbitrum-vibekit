import type { AlloraPrediction, GmxAlloraActionKind } from '../domain/types.js';

type DecideTradeActionParams = {
  prediction: AlloraPrediction;
  decisionThreshold: number;
  cooldownRemaining: number;
  maxLeverage: number;
  baseContributionUsd: number;
  previousAction?: GmxAlloraActionKind;
  previousSide?: 'long' | 'short';
};

type TradeDecision = {
  action: GmxAlloraActionKind;
  reason: string;
  side?: 'long' | 'short';
  leverage?: number;
  sizeUsd?: number;
};

const MAX_LEVERAGE_CAP = 2;
const SAFETY_BUFFER = 0.2;
const MIN_OPEN_SIZE_USD = 1;

const formatNumber = (value: number) => String(value);

export function decideTradeAction(params: DecideTradeActionParams): TradeDecision {
  if (params.cooldownRemaining > 0) {
    return {
      action: 'cooldown',
      reason: `Cooldown active for ${params.cooldownRemaining} more cycle(s).`,
    };
  }

  if (params.prediction.confidence < params.decisionThreshold) {
    return {
      action: 'hold',
      reason: `Signal confidence ${formatNumber(params.prediction.confidence)} below threshold ${formatNumber(
        params.decisionThreshold,
      )}; holding position.`,
    };
  }

  const side: 'long' | 'short' = params.prediction.direction === 'up' ? 'long' : 'short';
  const leverage = Math.min(params.maxLeverage, MAX_LEVERAGE_CAP);
  const sizeUsd = Number((params.baseContributionUsd * (1 - SAFETY_BUFFER)).toFixed(2));

  if (params.previousAction === 'open' && params.previousSide && params.previousSide !== side) {
    return {
      action: 'close',
      side: params.previousSide,
      leverage,
      sizeUsd,
      reason: `Signal direction flipped to ${side}; closing ${params.previousSide} position.`,
    };
  }

  if (params.previousAction === 'open' && params.previousSide === side) {
    return {
      action: 'reduce',
      side,
      leverage,
      sizeUsd,
      reason: `Signal persists in ${side}; reducing exposure.`,
    };
  }

  if (sizeUsd < MIN_OPEN_SIZE_USD) {
    return {
      action: 'hold',
      reason: `Configured allocation yields ~$${formatNumber(sizeUsd)} position size, below the minimum supported size; holding position.`,
    };
  }

  return {
    action: 'open',
    side,
    leverage,
    sizeUsd,
    reason: `Signal confidence ${formatNumber(params.prediction.confidence)} >= ${formatNumber(
      params.decisionThreshold,
    )}; opening ${side} position.`,
  };
}
