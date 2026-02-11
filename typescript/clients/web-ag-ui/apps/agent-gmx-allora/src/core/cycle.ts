import type { AlloraPrediction, GmxAlloraActionKind, GmxAlloraTelemetry } from '../domain/types.js';

import { decideTradeAction } from './decision.js';

type BuildCycleTelemetryParams = {
  prediction: AlloraPrediction;
  decisionThreshold: number;
  cooldownCycles: number;
  maxLeverage: number;
  baseContributionUsd: number;
  previousAction?: GmxAlloraActionKind;
  previousSide?: 'long' | 'short';
  cyclesSinceTrade: number;
  isFirstCycle: boolean;
  iteration: number;
  marketSymbol: string;
  now?: Date;
};

function isTradeAction(action: GmxAlloraActionKind): action is 'open' | 'reduce' | 'close' {
  return action === 'open' || action === 'reduce' || action === 'close';
}

export function buildCycleTelemetry(params: BuildCycleTelemetryParams): {
  telemetry: GmxAlloraTelemetry;
  nextCyclesSinceTrade: number;
} {
  const cooldownRemaining = 0;

  const decision = decideTradeAction({
    prediction: params.prediction,
    decisionThreshold: params.decisionThreshold,
    cooldownRemaining,
    maxLeverage: params.maxLeverage,
    baseContributionUsd: params.baseContributionUsd,
    previousAction: params.previousAction,
    previousSide: params.previousSide,
  });

  const timestamp = (params.now ?? new Date()).toISOString();
  const telemetry: GmxAlloraTelemetry = {
    cycle: params.iteration,
    action: decision.action,
    reason: decision.reason,
    marketSymbol: params.marketSymbol,
    side: isTradeAction(decision.action) ? decision.side : undefined,
    leverage: isTradeAction(decision.action) ? decision.leverage : undefined,
    sizeUsd: isTradeAction(decision.action) ? decision.sizeUsd : undefined,
    prediction: params.prediction,
    timestamp,
    metrics: {
      confidence: params.prediction.confidence,
      decisionThreshold: params.decisionThreshold,
      cooldownRemaining,
    },
  };

  return {
    telemetry,
    nextCyclesSinceTrade: isTradeAction(decision.action) ? 0 : params.cyclesSinceTrade + 1,
  };
}
