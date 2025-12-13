// Note: convertRouteToSummary removed - route extraction now handled directly in tool implementations
// This keeps the code simpler and avoids complex type dependencies

/**
 * Calculate price impact percentage
 */
export function calculatePriceImpact(
  _amountIn: bigint,
  amountOut: bigint,
  expectedAmountOut: bigint
): string {
  if (expectedAmountOut === 0n) {
    return '0';
  }

  const impact =
    (Number(expectedAmountOut - amountOut) / Number(expectedAmountOut)) * 100;
  return Math.abs(impact).toFixed(4);
}

/**
 * Calculate minimum amount out with slippage
 */
export function calculateMinimumAmountOut(
  amountOut: bigint,
  slippageTolerance: number
): bigint {
  const slippageBps = BigInt(Math.floor(slippageTolerance * 100));
  const slippageAmount = (amountOut * slippageBps) / 10000n;
  return amountOut - slippageAmount;
}

