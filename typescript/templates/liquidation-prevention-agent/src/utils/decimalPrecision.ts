/**
 * Decimal Precision Utility
 * 
 * Handles token amount precision to prevent "fractional component exceeds decimals" errors
 * when working with tokens that have limited decimal places (e.g., USDC has 6 decimals).
 */

/**
 * Round amount to the specified number of decimal places
 * @param amount The amount string to round
 * @param decimals The number of decimal places the token supports
 * @returns The rounded amount string
 */
export function roundToTokenDecimals(amount: string, decimals: number): string {
  // Handle "max" or other special values
  if (amount === "max" || isNaN(Number(amount))) {
    return amount;
  }

  const num = Number(amount);
  const factor = Math.pow(10, decimals);
  const rounded = Math.floor(num * factor) / factor;
  
  // Format to avoid scientific notation and trim unnecessary trailing zeros
  return rounded.toFixed(decimals).replace(/\.?0+$/, '');
}

/**
 * Validate that an amount doesn't exceed the token's decimal precision
 * @param amount The amount string to validate
 * @param decimals The number of decimal places the token supports
 * @returns true if valid, false if exceeds precision
 */
export function isValidTokenPrecision(amount: string, decimals: number): boolean {
  // Handle "max" or other special values
  if (amount === "max" || isNaN(Number(amount))) {
    return true;
  }

  const parts = amount.split('.');
  if (parts.length === 1) {
    return true; // No decimal part
  }
  
  return parts[1]!.length <= decimals;
}
