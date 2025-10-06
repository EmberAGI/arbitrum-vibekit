/**
 * Price calculation utilities for Camelot v3 concentrated liquidity
 * Implements proper tick-to-price and price-to-tick conversions
 */

/**
 * Convert tick to price using the Uniswap v3 formula
 * @param tick - The tick value
 * @param decimals0 - Token0 decimals
 * @param decimals1 - Token1 decimals
 * @returns The price as a number
 */
export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  const price = Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1);
  return price;
}

/**
 * Convert price to tick using the Uniswap v3 formula
 * @param price - The price as a number
 * @param tickSpacing - The tick spacing for the pool (default: 1)
 * @returns The tick value
 */
export function priceToTick(price: number, tickSpacing: number = 1): number {
  // Compute raw tick using logarithm
  const tick = Math.log(price) / Math.log(1.0001);

  // Round to nearest valid tick based on spacing
  const tickIndex = Math.round(tick / tickSpacing) * tickSpacing;
  return Math.floor(tickIndex);
}

/**
 * Calculate price range from tick range
 * @param tickLower - Lower tick
 * @param tickUpper - Upper tick
 * @param decimals0 - Token0 decimals
 * @param decimals1 - Token1 decimals
 * @returns Price range object
 */
export function calculatePriceRange(
  tickLower: number,
  tickUpper: number,
  decimals0: number,
  decimals1: number
): { lower: number; upper: number } {
  return {
    lower: tickToPrice(tickLower, decimals0, decimals1),
    upper: tickToPrice(tickUpper, decimals0, decimals1),
  };
}

/**
 * Calculate new tick range based on current price and volatility
 * @param currentPrice - Current token price
 * @param volatility - Price volatility (0-1)
 * @param riskProfile - Risk profile ('conservative', 'medium', 'aggressive')
 * @param decimals0 - Token0 decimals
 * @param decimals1 - Token1 decimals
 * @param tickSpacing - Pool tick spacing
 * @returns New tick range
 */
export function calculateNewTickRange(
  currentPrice: number,
  volatility: number,
  riskProfile: 'conservative' | 'medium' | 'aggressive',
  decimals0: number,
  decimals1: number,
  tickSpacing: number = 1
): { lower: number; upper: number } {
  // Get current tick
  const currentTick = priceToTick(currentPrice, tickSpacing);

  // Calculate range width based on risk profile and volatility
  let rangeWidthPct: number;

  switch (riskProfile) {
    case 'conservative':
      rangeWidthPct = Math.max(0.02, volatility * 0.5); // 2-5% range
      break;
    case 'medium':
      rangeWidthPct = Math.max(0.05, volatility * 0.8); // 5-10% range
      break;
    case 'aggressive':
      rangeWidthPct = Math.max(0.1, volatility * 1.2); // 10-20% range
      break;
    default:
      rangeWidthPct = 0.05; // Default to medium
  }

  // Calculate tick range based on percentage
  const rangeWidthTicks = Math.max(tickSpacing, Math.round((rangeWidthPct * currentTick) / 2));

  const lowerTick = Math.floor((currentTick - rangeWidthTicks) / tickSpacing) * tickSpacing;
  const upperTick = Math.ceil((currentTick + rangeWidthTicks) / tickSpacing) * tickSpacing;

  return {
    lower: lowerTick,
    upper: upperTick,
  };
}

/**
 * Calculate price deviation from range
 * @param currentPrice - Current price
 * @param rangeLower - Range lower price
 * @param rangeUpper - Range upper price
 * @returns Price deviation as percentage (0-1)
 */
export function calculatePriceDeviation(
  currentPrice: number,
  rangeLower: number,
  rangeUpper: number
): number {
  if (currentPrice >= rangeLower && currentPrice <= rangeUpper) {
    return 0; // In range
  }

  const rangeCenter = (rangeLower + rangeUpper) / 2;
  const rangeWidth = rangeUpper - rangeLower;

  if (currentPrice < rangeLower) {
    return Math.abs(currentPrice - rangeLower) / rangeWidth;
  } else {
    return Math.abs(currentPrice - rangeUpper) / rangeWidth;
  }
}

/**
 * Check if position is in range
 * @param currentTick - Current tick
 * @param tickLower - Position lower tick
 * @param tickUpper - Position upper tick
 * @returns True if in range
 */
export function isInRange(currentTick: number, tickLower: number, tickUpper: number): boolean {
  return currentTick >= tickLower && currentTick <= tickUpper;
}

/**
 * Calculate position utilization rate
 * @param currentTick - Current tick
 * @param tickLower - Position lower tick
 * @param tickUpper - Position upper tick
 * @returns Utilization rate (0-1)
 */
export function calculateUtilizationRate(
  currentTick: number,
  tickLower: number,
  tickUpper: number
): number {
  if (tickUpper === tickLower) return 0;

  const tickFromLower = currentTick - tickLower;
  const tickRange = tickUpper - tickLower;

  return Math.max(0, Math.min(1, tickFromLower / tickRange));
}
