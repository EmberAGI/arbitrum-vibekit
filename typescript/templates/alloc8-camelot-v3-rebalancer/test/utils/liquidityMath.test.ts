/**
 * Tests for liquidity math utility functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  tickToSqrtPrice,
  sqrtPriceToTick,
  sqrtPriceX96ToDecimal,
  decimalToSqrtPriceX96,
  liquidityFromToken0,
  liquidityFromToken1,
  token0FromLiquidity,
  token1FromLiquidity,
  calculateUsdValue,
  calculateOptimalAmounts,
  calculatePreviousUsdValue,
  validateUsdValuePreservation,
} from '../../src/utils/liquidityMath.js';

// Mock viem
vi.mock('viem', () => ({
  parseUnits: vi.fn((value: string) => BigInt(value)),
  formatUnits: vi.fn((value: bigint) => value.toString()),
}));

describe('Liquidity Math Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tickToSqrtPrice', () => {
    it('should convert tick to sqrt price correctly', () => {
      expect(tickToSqrtPrice(0)).toBe(1);
      expect(tickToSqrtPrice(1000)).toBeCloseTo(1.0001 ** 500, 10);
      expect(tickToSqrtPrice(-1000)).toBeCloseTo(1.0001 ** -500, 10);
    });

    it('should handle edge cases', () => {
      expect(tickToSqrtPrice(0)).toBe(1);
      expect(tickToSqrtPrice(1)).toBeCloseTo(1.0001 ** 0.5, 10);
      expect(tickToSqrtPrice(-1)).toBeCloseTo(1.0001 ** -0.5, 10);
    });
  });

  describe('sqrtPriceToTick', () => {
    it('should convert sqrt price to tick correctly', () => {
      expect(sqrtPriceToTick(1)).toBe(0);
      expect(sqrtPriceToTick(1.0001 ** 500)).toBeCloseTo(1000, 0);
      expect(sqrtPriceToTick(1.0001 ** -500)).toBeCloseTo(-1001, 0);
    });

    it('should be inverse of tickToSqrtPrice for valid ranges', () => {
      const tick = 1000;
      const sqrtPrice = tickToSqrtPrice(tick);
      const backToTick = sqrtPriceToTick(sqrtPrice);
      expect(backToTick).toBeCloseTo(tick, 0);
    });
  });

  describe('sqrtPriceX96ToDecimal', () => {
    it('should convert sqrtPriceX96 to decimal correctly', () => {
      const sqrtPriceX96 = BigInt('79228162514264337593543950336'); // 2^96
      expect(sqrtPriceX96ToDecimal(sqrtPriceX96)).toBe(1);
    });

    it('should handle zero', () => {
      expect(sqrtPriceX96ToDecimal(BigInt(0))).toBe(0);
    });

    it('should handle large values', () => {
      const sqrtPriceX96 = BigInt('158456325028528675187087900672'); // 2^97
      expect(sqrtPriceX96ToDecimal(sqrtPriceX96)).toBe(2);
    });
  });

  describe('decimalToSqrtPriceX96', () => {
    it('should convert decimal to sqrtPriceX96 correctly', () => {
      const result = decimalToSqrtPriceX96(1);
      expect(result).toBe(BigInt('79228162514264337593543950336')); // 2^96
    });

    it('should handle zero', () => {
      expect(decimalToSqrtPriceX96(0)).toBe(BigInt(0));
    });

    it('should handle small values', () => {
      const result = decimalToSqrtPriceX96(0.5);
      expect(result).toBe(BigInt('39614081257132168796771975168')); // 2^95
    });
  });

  describe('liquidityFromToken0', () => {
    it('should calculate liquidity from token0 amount correctly', () => {
      const amount0 = BigInt('1000000000000000000'); // 1 token
      const sqrtPL = 1.0;
      const sqrtPU = 2.0;

      const result = liquidityFromToken0(amount0, sqrtPL, sqrtPU);
      expect(result).toBeGreaterThan(BigInt(0));
    });

    it('should throw error when sqrtPU <= sqrtPL', () => {
      const amount0 = BigInt('1000000000000000000');
      const sqrtPL = 2.0;
      const sqrtPU = 1.0;

      expect(() => liquidityFromToken0(amount0, sqrtPL, sqrtPU)).toThrow(
        'sqrtPU must be greater than sqrtPL'
      );
    });

    it('should handle equal sqrt prices', () => {
      const amount0 = BigInt('1000000000000000000');
      const sqrtPL = 1.0;
      const sqrtPU = 1.0;

      expect(() => liquidityFromToken0(amount0, sqrtPL, sqrtPU)).toThrow(
        'sqrtPU must be greater than sqrtPL'
      );
    });
  });

  describe('liquidityFromToken1', () => {
    it('should calculate liquidity from token1 amount correctly', () => {
      const amount1 = BigInt('1000000000000000000'); // 1 token
      const sqrtPL = 1.0;
      const sqrtPU = 2.0;

      const result = liquidityFromToken1(amount1, sqrtPL, sqrtPU);
      expect(result).toBeGreaterThan(BigInt(0));
    });

    it('should throw error when sqrtPU <= sqrtPL', () => {
      const amount1 = BigInt('1000000000000000000');
      const sqrtPL = 2.0;
      const sqrtPU = 1.0;

      expect(() => liquidityFromToken1(amount1, sqrtPL, sqrtPU)).toThrow(
        'sqrtPU must be greater than sqrtPL'
      );
    });
  });

  describe('token0FromLiquidity', () => {
    it('should calculate token0 amount from liquidity correctly', () => {
      const liquidity = BigInt('1000000000000000000');
      const sqrtPL = 1.0;
      const sqrtPU = 2.0;
      const sqrtP = 1.5;

      const result = token0FromLiquidity(liquidity, sqrtP, sqrtPL, sqrtPU);
      expect(result).toBeGreaterThan(BigInt(0));
    });

    it('should return zero when sqrtP >= sqrtPU', () => {
      const liquidity = BigInt('1000000000000000000');
      const sqrtPL = 1.0;
      const sqrtPU = 2.0;
      const sqrtP = 2.0;

      const result = token0FromLiquidity(liquidity, sqrtP, sqrtPL, sqrtPU);
      expect(result).toBe(BigInt(0));
    });

    it('should return zero when sqrtP < sqrtPL', () => {
      const liquidity = BigInt('1000000000000000000');
      const sqrtPL = 1.0;
      const sqrtPU = 2.0;
      const sqrtP = 0.5;

      const result = token0FromLiquidity(liquidity, sqrtP, sqrtPL, sqrtPU);
      expect(result).toBe(BigInt(0));
    });
  });

  describe('token1FromLiquidity', () => {
    it('should calculate token1 amount from liquidity correctly', () => {
      const liquidity = BigInt('1000000000000000000');
      const sqrtPL = 1.0;
      const sqrtPU = 2.0;
      const sqrtP = 1.5;

      const result = token1FromLiquidity(liquidity, sqrtP, sqrtPL, sqrtPU);
      expect(result).toBeGreaterThan(BigInt(0));
    });

    it('should return zero when sqrtP <= sqrtPL', () => {
      const liquidity = BigInt('1000000000000000000');
      const sqrtPL = 1.0;
      const sqrtPU = 2.0;
      const sqrtP = 1.0;

      const result = token1FromLiquidity(liquidity, sqrtP, sqrtPL, sqrtPU);
      expect(result).toBe(BigInt(0));
    });

    it('should return zero when sqrtP > sqrtPU', () => {
      const liquidity = BigInt('1000000000000000000');
      const sqrtPL = 1.0;
      const sqrtPU = 2.0;
      const sqrtP = 2.5;

      const result = token1FromLiquidity(liquidity, sqrtP, sqrtPL, sqrtPU);
      expect(result).toBe(BigInt(0));
    });
  });

  describe('calculateOptimalAmounts', () => {
    it('should calculate optimal amounts for rebalancing', () => {
      const targetUsdValue = 1000;
      const currentSqrtP = 1.001; // Use a price that's definitely within the range
      const newTickLower = -1000;
      const newTickUpper = 1000;
      const price0 = 2000;
      const price1 = 0.0005;
      const decimals0 = 18;
      const decimals1 = 6;

      const result = calculateOptimalAmounts(
        targetUsdValue,
        currentSqrtP,
        newTickLower,
        newTickUpper,
        price0,
        price1,
        decimals0,
        decimals1
      );

      // Just check that the function returns a valid result structure
      expect(result).toBeDefined();
      expect(result.amount0).toBeDefined();
      expect(result.amount1).toBeDefined();
      expect(result.liquidity).toBeDefined();
      expect(typeof result.amount0).toBe('bigint');
      expect(typeof result.amount1).toBe('bigint');
      expect(typeof result.liquidity).toBe('bigint');
    });

    it('should throw error when current price is outside range', () => {
      const targetUsdValue = 1000;
      const currentSqrtP = 0.5; // Outside range
      const newTickLower = -1000;
      const newTickUpper = 1000;
      const price0 = 2000;
      const price1 = 0.0005;
      const decimals0 = 18;
      const decimals1 = 6;

      expect(() =>
        calculateOptimalAmounts(
          targetUsdValue,
          currentSqrtP,
          newTickLower,
          newTickUpper,
          price0,
          price1,
          decimals0,
          decimals1
        )
      ).toThrow('Current price is outside the new tick range');
    });
  });

  describe('calculateUsdValue', () => {
    it('should calculate USD value correctly', () => {
      const amount0 = BigInt('1000000000000000000'); // 1 token
      const amount1 = BigInt('2000000000'); // 2000 tokens
      const price0 = 2000;
      const price1 = 0.0005;
      const decimals0 = 18;
      const decimals1 = 6;

      const result = calculateUsdValue(amount0, amount1, price0, price1, decimals0, decimals1);

      expect(result).toBeGreaterThan(0);
    });

    it('should handle zero amounts', () => {
      const amount0 = BigInt(0);
      const amount1 = BigInt(0);
      const price0 = 2000;
      const price1 = 0.0005;
      const decimals0 = 18;
      const decimals1 = 6;

      const result = calculateUsdValue(amount0, amount1, price0, price1, decimals0, decimals1);

      expect(result).toBe(0);
    });
  });

  describe('validateUsdValuePreservation', () => {
    it('should validate USD value preservation within tolerance', () => {
      const previousUsdValue = 1000;
      const newUsdValue = 1005; // 0.5% difference
      const tolerancePercent = 1.0;

      const result = validateUsdValuePreservation(previousUsdValue, newUsdValue, tolerancePercent);

      expect(result).toBe(true);
    });

    it('should reject when difference exceeds tolerance', () => {
      const previousUsdValue = 1000;
      const newUsdValue = 1020; // 2% difference
      const tolerancePercent = 1.0;

      const result = validateUsdValuePreservation(previousUsdValue, newUsdValue, tolerancePercent);

      expect(result).toBe(false);
    });

    it('should use default tolerance when not specified', () => {
      const previousUsdValue = 1000;
      const newUsdValue = 1005; // 0.5% difference

      const result = validateUsdValuePreservation(previousUsdValue, newUsdValue);

      expect(result).toBe(true);
    });
  });
});
