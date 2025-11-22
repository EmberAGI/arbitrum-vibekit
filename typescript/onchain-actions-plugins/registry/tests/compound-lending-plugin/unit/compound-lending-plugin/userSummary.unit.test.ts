import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import {
  UserSummary,
  type CompoundUserPosition,
} from '../../../../src/compound-lending-plugin/userSummary.js';

describe('UserSummary', () => {
  describe('constructor', () => {
    it('should create UserSummary with valid position', () => {
      const position: CompoundUserPosition = {
        collateral: [],
        borrowBalance: ethers.BigNumber.from(0),
        borrowBalanceUsd: '0',
        totalCollateralUsd: '0',
        totalBorrowsUsd: '0',
        netWorthUsd: '0',
        healthFactor: '0',
        currentLoanToValue: '0',
        currentLiquidationThreshold: '0',
        availableBorrowsUsd: '0',
      };

      const summary = new UserSummary(position);
      expect(summary.position).toEqual(position);
    });
  });

  describe('toHumanReadable', () => {
    it('should format empty position (no collateral, no borrows)', () => {
      const position: CompoundUserPosition = {
        collateral: [],
        borrowBalance: ethers.BigNumber.from(0),
        borrowBalanceUsd: '0',
        totalCollateralUsd: '0',
        totalBorrowsUsd: '0',
        netWorthUsd: '0',
        healthFactor: '0',
        currentLoanToValue: '0',
        currentLiquidationThreshold: '0',
        availableBorrowsUsd: '0',
      };

      const summary = new UserSummary(position);
      const output = summary.toHumanReadable();

      expect(output).toContain('Total Collateral (USD): 0');
      expect(output).toContain('Total Borrows (USD): 0');
      expect(output).toContain('Net Worth (USD): 0');
      expect(output).toContain('Health Factor: 0');
      expect(output).toContain('Loan to Value: 0');
      expect(output).toContain('Available to Borrow (USD): 0');
      expect(output).toContain('No borrows');
    });

    it('should format position with collateral only', () => {
      const position: CompoundUserPosition = {
        collateral: [
          {
            asset: '0x1234567890123456789012345678901234567890',
            balance: ethers.BigNumber.from('1000000000000000000'), // 1 ETH
            balanceUsd: '2500.50',
          },
        ],
        borrowBalance: ethers.BigNumber.from(0),
        borrowBalanceUsd: '0',
        totalCollateralUsd: '2500.50',
        totalBorrowsUsd: '0',
        netWorthUsd: '2500.50',
        healthFactor: '0',
        currentLoanToValue: '0',
        currentLiquidationThreshold: '0.85',
        availableBorrowsUsd: '2125.43',
      };

      const summary = new UserSummary(position);
      const output = summary.toHumanReadable();

      expect(output).toContain('Total Collateral (USD): 2500.5');
      expect(output).toContain('Total Borrows (USD): 0');
      expect(output).toContain('Net Worth (USD): 2500.5');
      expect(output).toContain('Available to Borrow (USD): 2125.43');
      expect(output).toContain('0x1234567890123456789012345678901234567890');
      expect(output).toContain('No borrows');
    });

    it('should format position with borrows only', () => {
      const position: CompoundUserPosition = {
        collateral: [],
        borrowBalance: ethers.BigNumber.from('500000000'), // 500 USDC (6 decimals)
        borrowBalanceUsd: '500.25',
        totalCollateralUsd: '0',
        totalBorrowsUsd: '500.25',
        netWorthUsd: '-500.25',
        healthFactor: '0',
        currentLoanToValue: '0',
        currentLiquidationThreshold: '0',
        availableBorrowsUsd: '0',
      };

      const summary = new UserSummary(position);
      const output = summary.toHumanReadable();

      expect(output).toContain('Total Collateral (USD): 0');
      expect(output).toContain('Total Borrows (USD): 500.25');
      expect(output).toContain('Net Worth (USD): -500.25');
      expect(output).toContain('Base Asset: 500000000');
    });

    it('should format position with both collateral and borrows', () => {
      const position: CompoundUserPosition = {
        collateral: [
          {
            asset: '0xWETH',
            balance: ethers.BigNumber.from('2000000000000000000'), // 2 WETH
            balanceUsd: '5000',
          },
          {
            asset: '0xUSDC',
            balance: ethers.BigNumber.from('1000000000'), // 1000 USDC
            balanceUsd: '1000',
          },
        ],
        borrowBalance: ethers.BigNumber.from('200000000'), // 200 USDC
        borrowBalanceUsd: '200',
        totalCollateralUsd: '6000',
        totalBorrowsUsd: '200',
        netWorthUsd: '5800',
        healthFactor: '25.5',
        currentLoanToValue: '0.033',
        currentLiquidationThreshold: '0.85',
        availableBorrowsUsd: '4900',
      };

      const summary = new UserSummary(position);
      const output = summary.toHumanReadable();

      expect(output).toContain('Total Collateral (USD): 6000');
      expect(output).toContain('Total Borrows (USD): 200');
      expect(output).toContain('Net Worth (USD): 5800');
      expect(output).toContain('Health Factor: 25.5');
      expect(output).toContain('Loan to Value: 0.03');
      expect(output).toContain('Available to Borrow (USD): 4900');
      expect(output).toContain('0xWETH');
      expect(output).toContain('0xUSDC');
      expect(output).toContain('Base Asset: 200000000');
    });

    it('should filter out collateral with zero USD value', () => {
      const position: CompoundUserPosition = {
        collateral: [
          {
            asset: '0xWETH',
            balance: ethers.BigNumber.from('1000000000000000000'),
            balanceUsd: '2500',
          },
          {
            asset: '0xUSDC',
            balance: ethers.BigNumber.from('500000000'),
            balanceUsd: '0', // Zero USD value
          },
        ],
        borrowBalance: ethers.BigNumber.from(0),
        borrowBalanceUsd: '0',
        totalCollateralUsd: '2500',
        totalBorrowsUsd: '0',
        netWorthUsd: '2500',
        healthFactor: '0',
        currentLoanToValue: '0',
        currentLiquidationThreshold: '0.85',
        availableBorrowsUsd: '2125',
      };

      const summary = new UserSummary(position);
      const output = summary.toHumanReadable();

      expect(output).toContain('0xWETH');
      expect(output).not.toContain('0xUSDC'); // Should be filtered out
    });

    it('should format integer values correctly', () => {
      const position: CompoundUserPosition = {
        collateral: [],
        borrowBalance: ethers.BigNumber.from(0),
        borrowBalanceUsd: '0',
        totalCollateralUsd: '1000',
        totalBorrowsUsd: '500',
        netWorthUsd: '500',
        healthFactor: '2',
        currentLoanToValue: '0.5',
        currentLiquidationThreshold: '0.85',
        availableBorrowsUsd: '350',
      };

      const summary = new UserSummary(position);
      const output = summary.toHumanReadable();

      expect(output).toContain('Total Collateral (USD): 1000');
      expect(output).toContain('Total Borrows (USD): 500');
      expect(output).toContain('Health Factor: 2');
    });

    it('should format decimal values with 2 decimal places', () => {
      const position: CompoundUserPosition = {
        collateral: [],
        borrowBalance: ethers.BigNumber.from(0),
        borrowBalanceUsd: '0',
        totalCollateralUsd: '1234.567',
        totalBorrowsUsd: '567.891',
        netWorthUsd: '666.676',
        healthFactor: '1.234567',
        currentLoanToValue: '0.460123',
        currentLiquidationThreshold: '0.85',
        availableBorrowsUsd: '481.23',
      };

      const summary = new UserSummary(position);
      const output = summary.toHumanReadable();

      // Should round to 2 decimal places
      expect(output).toContain('Total Collateral (USD): 1234.57');
      expect(output).toContain('Total Borrows (USD): 567.89');
      expect(output).toContain('Net Worth (USD): 666.68');
      expect(output).toContain('Loan to Value: 0.46');
    });

    it('should handle BigNumber values correctly', () => {
      const position: CompoundUserPosition = {
        collateral: [
          {
            asset: '0xWETH',
            balance: ethers.BigNumber.from('1000000000000000000'), // 1 ETH (18 decimals)
            balanceUsd: '2500',
          },
        ],
        borrowBalance: ethers.BigNumber.from('100000000'), // 100 USDC (6 decimals)
        borrowBalanceUsd: '100',
        totalCollateralUsd: '2500',
        totalBorrowsUsd: '100',
        netWorthUsd: '2400',
        healthFactor: '2.125',
        currentLoanToValue: '0.04',
        currentLiquidationThreshold: '0.85',
        availableBorrowsUsd: '2025',
      };

      const summary = new UserSummary(position);
      const output = summary.toHumanReadable();

      // BigNumber values should be formatted (not in scientific notation for reasonable sizes)
      expect(output).toContain('1000000000000000000'); // 1 ETH in wei
      expect(output).toContain('100000000'); // 100 USDC
      expect(output).toContain('Total Collateral (USD): 2500');
      expect(output).toContain('Total Borrows (USD): 100');
    });
  });
});
