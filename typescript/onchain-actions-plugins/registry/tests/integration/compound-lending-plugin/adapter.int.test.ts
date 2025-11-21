import { describe, it, expect, beforeAll } from 'vitest';
import { CompoundAdapter } from '../../../src/compound-lending-plugin/adapter.js';

const ARBITRUM_RPC_URL = process.env.ARBITRUM_ONE_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const TEST_WALLET = '0xDa805dBC6530c9ed1360b7c61624613c4Fe380a9';
const TEST_TIMEOUT = 30000;

describe('CompoundAdapter Integration Tests', () => {
  describe('Adapter Initialization', () => {
    it('should be created with valid parameters (Arbitrum)', () => {
      const adapter = new CompoundAdapter({
        chainId: 42161,
        rpcUrl: ARBITRUM_RPC_URL,
        marketId: 'USDC',
      });

      expect(adapter.chain.id).toBe(42161);
      expect(adapter.market.COMET).toBeDefined();
      expect(adapter.market.COMET).toBe('0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf');
    });

    it('should be created with Arbitrum USDCE market', () => {
      const adapter = new CompoundAdapter({
        chainId: 42161,
        rpcUrl: ARBITRUM_RPC_URL,
        marketId: 'USDCE',
      });

      expect(adapter.chain.id).toBe(42161);
      expect(adapter.market.COMET).toBe('0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA');
    });

    it('should throw error for unsupported chain', () => {
      expect(() => {
        new CompoundAdapter({
          chainId: 999,
          rpcUrl: ARBITRUM_RPC_URL,
          marketId: 'USDC',
        });
      }).toThrow();
    });

    it('should throw error for invalid market on Arbitrum', () => {
      expect(() => {
        new CompoundAdapter({
          chainId: 42161,
          rpcUrl: ARBITRUM_RPC_URL,
          marketId: 'INVALID',
        });
      }).toThrow();
    });
  });

  describe('getUserSummary', () => {
    let adapter: CompoundAdapter;

    beforeAll(() => {
      adapter = new CompoundAdapter({
        chainId: 42161,
        rpcUrl: ARBITRUM_RPC_URL,
        marketId: 'USDC',
      });
    });

    it(
      'should return valid response structure for wallet address',
      async () => {
        const result = await adapter.getUserSummary({
          walletAddress: TEST_WALLET,
        });

        expect(result).toHaveProperty('userReserves');
        expect(Array.isArray(result.userReserves)).toBe(true);

        const stringFields = [
          'totalLiquidityUsd',
          'totalCollateralUsd',
          'totalBorrowsUsd',
          'netWorthUsd',
          'availableBorrowsUsd',
          'currentLoanToValue',
          'currentLiquidationThreshold',
          'healthFactor',
        ];
        for (const field of stringFields) {
          expect(result).toHaveProperty(field);
          expect(typeof result[field as keyof typeof result]).toBe('string');
        }

        for (const reserve of result.userReserves) {
          expect(reserve.tokenUid).toHaveProperty('address');
          expect(reserve.tokenUid).toHaveProperty('chainId');
          expect(reserve.tokenUid.chainId).toBe('42161');
          expect(reserve.tokenUid.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

          const reserveFields = [
            'underlyingBalance',
            'underlyingBalanceUsd',
            'variableBorrows',
            'variableBorrowsUsd',
            'totalBorrows',
            'totalBorrowsUsd',
          ];
          for (const field of reserveFields) {
            expect(reserve).toHaveProperty(field);
            expect(typeof reserve[field as keyof typeof reserve]).toBe('string');
          }
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'should return borrow position when wallet has borrows',
      async () => {
        const result = await adapter.getUserSummary({
          walletAddress: TEST_WALLET,
        });

        if (parseFloat(result.totalBorrowsUsd) > 0) {
          const borrowReserve = result.userReserves.find((r) => parseFloat(r.totalBorrowsUsd) > 0);

          expect(borrowReserve).toBeDefined();
          expect(borrowReserve?.variableBorrows).toBe(borrowReserve?.totalBorrows);
          expect(parseFloat(borrowReserve?.totalBorrowsUsd || '0')).toBeGreaterThan(0);
          expect(parseFloat(borrowReserve?.variableBorrowsUsd || '0')).toBeGreaterThan(0);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'should calculate net worth correctly',
      async () => {
        const result = await adapter.getUserSummary({
          walletAddress: TEST_WALLET,
        });

        const totalCollateral = parseFloat(result.totalCollateralUsd);
        const totalBorrows = parseFloat(result.totalBorrowsUsd);
        const netWorth = parseFloat(result.netWorthUsd);
        const expectedNetWorth = totalCollateral - totalBorrows;

        expect(Math.abs(netWorth - expectedNetWorth)).toBeLessThan(0.01);
      },
      TEST_TIMEOUT,
    );

    it(
      'should calculate health factor correctly',
      async () => {
        const result = await adapter.getUserSummary({
          walletAddress: TEST_WALLET,
        });

        const totalBorrows = parseFloat(result.totalBorrowsUsd);
        const totalCollateral = parseFloat(result.totalCollateralUsd);
        const healthFactor = parseFloat(result.healthFactor);

        expect(Number.isFinite(healthFactor)).toBe(true);

        if (totalBorrows > 0) {
          if (totalCollateral > 0) {
            expect(healthFactor).toBeGreaterThan(0);
          } else {
            expect(healthFactor).toBeGreaterThanOrEqual(0);
          }
          expect(healthFactor).toBeLessThanOrEqual(1e18);
        } else {
          expect(healthFactor).toBeGreaterThan(1e10);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'should calculate LTV correctly',
      async () => {
        const result = await adapter.getUserSummary({
          walletAddress: TEST_WALLET,
        });

        const ltv = parseFloat(result.currentLoanToValue);
        const totalCollateral = parseFloat(result.totalCollateralUsd);
        const totalBorrows = parseFloat(result.totalBorrowsUsd);

        expect(ltv).toBeGreaterThanOrEqual(0);

        if (totalCollateral > 0) {
          const expectedLtv = (totalBorrows / totalCollateral) * 100;
          expect(Math.abs(ltv - expectedLtv)).toBeLessThan(0.01);
        } else {
          expect(ltv).toBe(0);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'should return available borrows correctly',
      async () => {
        const result = await adapter.getUserSummary({
          walletAddress: TEST_WALLET,
        });

        const availableBorrows = parseFloat(result.availableBorrowsUsd);
        const totalCollateral = parseFloat(result.totalCollateralUsd);

        expect(availableBorrows).toBeGreaterThanOrEqual(0);

        if (totalCollateral > 0) {
          expect(availableBorrows).toBeLessThanOrEqual(totalCollateral);
        }
      },
      TEST_TIMEOUT,
    );
  });
});
