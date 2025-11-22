import { describe, it, expect } from 'vitest';
import { getMarket, getMarketsForChain } from '../../../../src/compound-lending-plugin/market.js';

describe('Market Functions', () => {
  describe('getMarket', () => {
    it('should return market for valid chain and market ID (Ethereum USDC)', () => {
      const market = getMarket(1, 'USDC');
      expect(market.COMET).toBe('0xc3d688B66703497DAA19211EEdff47f25384cdc3');
    });

    it('should return market for valid chain and market ID (Ethereum WETH)', () => {
      const market = getMarket(1, 'WETH');
      expect(market.COMET).toBe('0xA17581A9E3356d9A858b789D68B4d866e593aE94');
    });

    it('should return market for Arbitrum USDCE', () => {
      const market = getMarket(42161, 'USDCE');
      expect(market.COMET).toBe('0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA');
    });

    it('should return market for Base USDC', () => {
      const market = getMarket(8453, 'USDC');
      expect(market.COMET).toBe('0xb125E6687d4313864e53df431d5425969c15Eb2F');
    });

    it('should throw error for unsupported chain ID', () => {
      expect(() => {
        getMarket(999, 'USDC');
      }).toThrow('Compound: no markets found for chain ID 999');
    });

    it('should throw error for invalid market ID on Ethereum', () => {
      expect(() => {
        getMarket(1, 'INVALID');
      }).toThrow("Compound: market 'INVALID' not found for chain ID 1");
    });

    it('should throw error for invalid market ID on Arbitrum', () => {
      expect(() => {
        getMarket(42161, 'INVALID');
      }).toThrow("Compound: market 'INVALID' not found for chain ID 42161");
    });

    it('should include available markets in error message', () => {
      try {
        getMarket(1, 'INVALID');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('Available markets:');
        expect(errorMessage).toContain('USDC');
        expect(errorMessage).toContain('WETH');
      }
    });
  });

  describe('getMarketsForChain', () => {
    it('should return all markets for Ethereum', () => {
      const markets = getMarketsForChain(1);
      expect(Object.keys(markets)).toContain('USDC');
      expect(Object.keys(markets)).toContain('WETH');
      expect(Object.keys(markets)).toContain('USDT');
      expect(Object.keys(markets)).toContain('WSTETH');
      expect(Object.keys(markets)).toContain('USDS');
      expect(Object.keys(markets).length).toBe(5);
    });

    it('should return all markets for Arbitrum', () => {
      const markets = getMarketsForChain(42161);
      expect(Object.keys(markets)).toContain('USDCE');
      expect(Object.keys(markets)).toContain('USDC');
      expect(Object.keys(markets)).toContain('WETH');
      expect(Object.keys(markets)).toContain('USDT');
      expect(Object.keys(markets).length).toBe(4);
    });

    it('should return all markets for Base', () => {
      const markets = getMarketsForChain(8453);
      expect(Object.keys(markets)).toContain('USDC');
      expect(Object.keys(markets)).toContain('USDBC');
      expect(Object.keys(markets)).toContain('WETH');
      expect(Object.keys(markets)).toContain('AERO');
      expect(Object.keys(markets).length).toBe(4);
    });

    it('should throw error for unsupported chain ID', () => {
      expect(() => {
        getMarketsForChain(999);
      }).toThrow('Compound: no markets found for chain ID 999');
    });

    it('should return markets with correct COMET addresses', () => {
      const markets = getMarketsForChain(1);
      expect(markets.USDC.COMET).toBe('0xc3d688B66703497DAA19211EEdff47f25384cdc3');
      expect(markets.WETH.COMET).toBe('0xA17581A9E3356d9A858b789D68B4d866e593aE94');
    });
  });
});
