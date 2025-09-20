/**
 * Liquidity math utilities for Uniswap v3 / Algebra concentrated liquidity
 * Implements the exact formulas for maintaining USD value during rebalancing
 */

import { parseUnits, formatUnits } from 'viem';

/**
 * Convert tick to sqrt price (Uniswap v3 / Algebra formula)
 * sqrtPrice(tick) = 1.0001^(tick/2)
 */
export function tickToSqrtPrice(tick: number): number {
  return Math.pow(1.0001, tick / 2);
}

/**
 * Convert sqrt price to tick
 * tick = 2 * log(sqrtPrice) / log(1.0001)
 */
export function sqrtPriceToTick(sqrtPrice: number): number {
  return Math.floor((2 * Math.log(sqrtPrice)) / Math.log(1.0001));
}

/**
 * Convert sqrtPriceX96 to decimal sqrt price
 * sqrtP = sqrtPriceX96 / 2^96
 */
export function sqrtPriceX96ToDecimal(sqrtPriceX96: bigint): number {
  return Number(sqrtPriceX96) / Math.pow(2, 96);
}

/**
 * Convert decimal sqrt price to sqrtPriceX96
 * sqrtPriceX96 = sqrtP * 2^96
 */
export function decimalToSqrtPriceX96(sqrtP: number): bigint {
  return BigInt(Math.floor(sqrtP * Math.pow(2, 96)));
}

/**
 * Calculate liquidity from token0 amount
 * L = (amount0 * sqrtPL * sqrtPU) / (sqrtPU - sqrtPL)
 * Used when sqrtP < sqrtPU (providing only token0)
 */
export function liquidityFromToken0(amount0: bigint, sqrtPL: number, sqrtPU: number): bigint {
  if (sqrtPU <= sqrtPL) {
    throw new Error('sqrtPU must be greater than sqrtPL');
  }

  const numerator = amount0 * BigInt(Math.floor(sqrtPL * 1e18)) * BigInt(Math.floor(sqrtPU * 1e18));
  const denominator = BigInt(Math.floor((sqrtPU - sqrtPL) * 1e18));

  return numerator / denominator;
}

/**
 * Calculate liquidity from token1 amount
 * L = amount1 / (sqrtPU - sqrtPL)
 * Used when sqrtP > sqrtPL (providing only token1)
 */
export function liquidityFromToken1(amount1: bigint, sqrtPL: number, sqrtPU: number): bigint {
  if (sqrtPU <= sqrtPL) {
    throw new Error('sqrtPU must be greater than sqrtPL');
  }

  const denominator = BigInt(Math.floor((sqrtPU - sqrtPL) * 1e18));
  return (amount1 * BigInt(1e18)) / denominator;
}

/**
 * Calculate token0 amount from liquidity
 * amount0 = L * (sqrtPU - sqrtP) / (sqrtP * sqrtPU)
 */
export function token0FromLiquidity(
  liquidity: bigint,
  sqrtP: number,
  sqrtPL: number,
  sqrtPU: number
): bigint {
  if (sqrtP <= sqrtPL || sqrtP >= sqrtPU) {
    return BigInt(0);
  }

  const numerator = liquidity * BigInt(Math.floor((sqrtPU - sqrtP) * 1e18));
  const denominator = BigInt(Math.floor(sqrtP * sqrtPU * 1e18));

  return numerator / denominator;
}

/**
 * Calculate token1 amount from liquidity
 * amount1 = L * (sqrtP - sqrtPL)
 */
export function token1FromLiquidity(
  liquidity: bigint,
  sqrtP: number,
  sqrtPL: number,
  sqrtPU: number
): bigint {
  if (sqrtP <= sqrtPL || sqrtP >= sqrtPU) {
    return BigInt(0);
  }

  return (liquidity * BigInt(Math.floor((sqrtP - sqrtPL) * 1e18))) / BigInt(1e18);
}

/**
 * Calculate USD value of token amounts
 */
export function calculateUsdValue(
  amount0: bigint,
  amount1: bigint,
  price0: number,
  price1: number,
  decimals0: number,
  decimals1: number
): number {
  const value0 = Number(formatUnits(amount0, decimals0)) * price0;
  const value1 = Number(formatUnits(amount1, decimals1)) * price1;
  return value0 + value1;
}

/**
 * Calculate optimal token amounts to maintain USD value
 * This is the core function for rebalancing with same notional value
 */
export function calculateOptimalAmounts(
  targetUsdValue: number,
  currentSqrtP: number,
  newTickLower: number,
  newTickUpper: number,
  price0: number,
  price1: number,
  decimals0: number,
  decimals1: number
): { amount0: bigint; amount1: bigint; liquidity: bigint } {
  // Convert ticks to sqrt prices
  const sqrtPL = tickToSqrtPrice(newTickLower);
  const sqrtPU = tickToSqrtPrice(newTickUpper);

  console.log(`🔍 Liquidity Math Debug:`);
  console.log(`   currentSqrtP: ${currentSqrtP}`);
  console.log(`   sqrtPL (lower): ${sqrtPL}`);
  console.log(`   sqrtPU (upper): ${sqrtPU}`);
  console.log(`   currentSqrtP <= sqrtPL: ${currentSqrtP <= sqrtPL}`);
  console.log(`   currentSqrtP >= sqrtPU: ${currentSqrtP >= sqrtPU}`);

  if (currentSqrtP < sqrtPL || currentSqrtP >= sqrtPU) {
    throw new Error(
      `Current price is outside the new tick range. Current: ${currentSqrtP}, Range: [${sqrtPL}, ${sqrtPU})`
    );
  }

  // Start with a trial liquidity and scale to match target USD value
  let trialLiquidity = BigInt(1e18); // Start with 1 unit of liquidity

  // Calculate token amounts for trial liquidity
  let amount0 = token0FromLiquidity(trialLiquidity, currentSqrtP, sqrtPL, sqrtPU);
  let amount1 = token1FromLiquidity(trialLiquidity, currentSqrtP, sqrtPL, sqrtPU);

  // Calculate USD value of trial amounts
  let trialUsdValue = calculateUsdValue(amount0, amount1, price0, price1, decimals0, decimals1);

  // Scale liquidity to match target USD value
  const scaleFactor = targetUsdValue / trialUsdValue;
  const scaledLiquidity = BigInt(Math.floor(Number(trialLiquidity) * scaleFactor));

  // Calculate final token amounts
  const finalAmount0 = token0FromLiquidity(scaledLiquidity, currentSqrtP, sqrtPL, sqrtPU);
  const finalAmount1 = token1FromLiquidity(scaledLiquidity, currentSqrtP, sqrtPL, sqrtPU);

  return {
    amount0: finalAmount0,
    amount1: finalAmount1,
    liquidity: scaledLiquidity,
  };
}

/**
 * Calculate previous position USD value from position data
 */
export function calculatePreviousUsdValue(
  position: {
    amount0: string;
    amount1: string;
    token0: string;
    token1: string;
  },
  price0: number,
  price1: number,
  decimals0: number,
  decimals1: number
): number {
  const amount0 = parseUnits(position.amount0, decimals0);
  const amount1 = parseUnits(position.amount1, decimals1);

  return calculateUsdValue(amount0, amount1, price0, price1, decimals0, decimals1);
}

/**
 * Validate that new position maintains USD value within tolerance
 */
export function validateUsdValuePreservation(
  previousUsdValue: number,
  newUsdValue: number,
  tolerancePercent: number = 1.0 // 1% tolerance by default
): boolean {
  const difference = Math.abs(newUsdValue - previousUsdValue);
  const tolerance = previousUsdValue * (tolerancePercent / 100);

  return difference <= tolerance;
}
