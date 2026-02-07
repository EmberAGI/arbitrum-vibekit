import type { PendleYieldToken } from '../domain/types.js';

export type RebalanceDecision = {
  shouldRebalance: boolean;
  apyDelta: number;
  nextToken: PendleYieldToken;
};

export function rankYieldTokens(tokens: readonly PendleYieldToken[]): PendleYieldToken[] {
  return [...tokens].sort((left, right) => {
    if (right.apy !== left.apy) {
      return right.apy - left.apy;
    }
    const symbolOrder = left.ytSymbol.localeCompare(right.ytSymbol);
    if (symbolOrder !== 0) {
      return symbolOrder;
    }
    return left.marketAddress.localeCompare(right.marketAddress);
  });
}

export function evaluateRebalanceDecision(params: {
  bestToken: PendleYieldToken;
  currentToken: PendleYieldToken;
  thresholdPct: number;
}): RebalanceDecision {
  const apyDelta = Number((params.bestToken.apy - params.currentToken.apy).toFixed(2));
  const shouldRebalance = apyDelta >= params.thresholdPct;
  return {
    shouldRebalance,
    apyDelta,
    nextToken: shouldRebalance ? params.bestToken : params.currentToken,
  };
}
