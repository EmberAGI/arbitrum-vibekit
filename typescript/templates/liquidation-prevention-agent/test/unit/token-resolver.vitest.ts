import { describe, it, expect, beforeEach } from 'vitest';
import { 
  findTokenInfo, 
  resolveTokenInfo, 
  resolveTokenAddress, 
  getChainName, 
  isTokenSymbol,
  type TokenInfo,
  type FindTokenResult
} from '../../src/utils/tokenResolver.js';

describe('Token Resolver Utilities', () => {
  let mockTokenMap: Record<string, Array<TokenInfo>>;

  beforeEach(() => {
    // Mock token map with various scenarios
    mockTokenMap = {
      'USDC': [
        { chainId: '1', address: '0xA0b86a33E6411B3FCd9Ac3C10e9C8f7a8074f74C', decimals: 6 },
        { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
        { chainId: '137', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 }
      ],
      'WETH': [
        { chainId: '1', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
        { chainId: '42161', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 }
      ],
      'DAI': [
        { chainId: '1', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 }
      ],
      'ARB': [
        { chainId: '42161', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 }
      ]
    };
  });

  describe('findTokenInfo', () => {
    it('should find single token correctly', () => {
      const result = findTokenInfo(mockTokenMap, 'DAI');
      
      expect(result.type).toBe('found');
      if (result.type === 'found') {
        expect(result.token).toEqual({
          chainId: '1',
          address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
          decimals: 18
        });
      }
    });

    it('should return clarificationNeeded for multi-chain tokens', () => {
      const result = findTokenInfo(mockTokenMap, 'USDC');
      
      expect(result.type).toBe('clarificationNeeded');
      if (result.type === 'clarificationNeeded') {
        expect(result.options).toHaveLength(3);
        expect(result.options[0]?.chainId).toBe('1');
        expect(result.options[1]?.chainId).toBe('42161');
        expect(result.options[2]?.chainId).toBe('137');
      }
    });

    it('should return notFound for unknown tokens', () => {
      const result = findTokenInfo(mockTokenMap, 'UNKNOWN');
      
      expect(result.type).toBe('notFound');
    });

    it('should be case insensitive', () => {
      const result1 = findTokenInfo(mockTokenMap, 'dai');
      const result2 = findTokenInfo(mockTokenMap, 'DAI');
      const result3 = findTokenInfo(mockTokenMap, 'Dai');
      
      expect(result1.type).toBe('found');
      expect(result2.type).toBe('found');
      expect(result3.type).toBe('found');
      
      if (result1.type === 'found' && result2.type === 'found' && result3.type === 'found') {
        expect(result1.token).toEqual(result2.token);
        expect(result2.token).toEqual(result3.token);
      }
    });

    it('should handle empty token arrays', () => {
      const emptyTokenMap = { 'EMPTY': [] };
      const result = findTokenInfo(emptyTokenMap, 'EMPTY');
      
      expect(result.type).toBe('notFound');
    });
  });

  describe('resolveTokenInfo', () => {
    it('should resolve single-chain token without preferred chain', () => {
      const result = resolveTokenInfo(mockTokenMap, 'DAI');
      
      expect(result).toEqual({
        chainId: '1',
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        decimals: 18
      });
    });

    it('should resolve multi-chain token with preferred chain', () => {
      const result = resolveTokenInfo(mockTokenMap, 'USDC', '42161');
      
      expect(result).toEqual({
        chainId: '42161',
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        decimals: 6
      });
    });

    it('should throw error for unknown token', () => {
      expect(() => resolveTokenInfo(mockTokenMap, 'UNKNOWN')).toThrowError(
        "Token 'UNKNOWN' not supported. Available tokens: USDC, WETH, DAI, ARB"
      );
    });

    it('should throw error for multi-chain token without preferred chain', () => {
      expect(() => resolveTokenInfo(mockTokenMap, 'USDC')).toThrowError(
        'Multiple chains found for USDC: USDC on Ethereum Mainnet (Chain ID: 1), USDC on Arbitrum One (Chain ID: 42161), USDC on Polygon (Chain ID: 137). Please specify the chain ID in your request.'
      );
    });

    it('should throw error when preferred chain not available for token', () => {
      expect(() => resolveTokenInfo(mockTokenMap, 'USDC', '999')).toThrowError(
        'Multiple chains found for USDC'
      );
    });

    it('should handle case insensitive token resolution', () => {
      const result1 = resolveTokenInfo(mockTokenMap, 'dai');
      const result2 = resolveTokenInfo(mockTokenMap, 'DAI');
      
      expect(result1).toEqual(result2);
    });

    it('should resolve first available chain when preferred chain matches', () => {
      const result = resolveTokenInfo(mockTokenMap, 'WETH', '1');
      
      expect(result).toEqual({
        chainId: '1',
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        decimals: 18
      });
    });
  });

  describe('resolveTokenAddress', () => {
    it('should return address for single-chain token', () => {
      const address = resolveTokenAddress(mockTokenMap, 'DAI');
      
      expect(address).toBe('0x6B175474E89094C44Da98b954EedeAC495271d0F');
    });

    it('should return address for multi-chain token with preferred chain', () => {
      const address = resolveTokenAddress(mockTokenMap, 'USDC', '42161');
      
      expect(address).toBe('0xaf88d065e77c8cc2239327c5edb3a432268e5831');
    });

    it('should throw error for unknown token', () => {
      expect(() => resolveTokenAddress(mockTokenMap, 'UNKNOWN')).toThrowError(
        "Token 'UNKNOWN' not supported"
      );
    });

    it('should throw error for multi-chain token without preferred chain', () => {
      expect(() => resolveTokenAddress(mockTokenMap, 'WETH')).toThrowError(
        'Multiple chains found for WETH'
      );
    });
  });

  describe('getChainName', () => {
    it('should return correct names for known chains', () => {
      expect(getChainName('1')).toBe('Ethereum Mainnet');
      expect(getChainName('10')).toBe('Optimism');
      expect(getChainName('137')).toBe('Polygon');
      expect(getChainName('8453')).toBe('Base');
      expect(getChainName('42161')).toBe('Arbitrum One');
    });

    it('should return generic name for unknown chains', () => {
      expect(getChainName('999')).toBe('Chain 999');
      expect(getChainName('12345')).toBe('Chain 12345');
    });

    it('should handle string chain IDs', () => {
      expect(getChainName('42161')).toBe('Arbitrum One');
      expect(getChainName('1')).toBe('Ethereum Mainnet');
    });
  });

  describe('isTokenSymbol', () => {
    it('should identify valid token symbols', () => {
      expect(isTokenSymbol('USDC')).toBe(true);
      expect(isTokenSymbol('WETH')).toBe(true);
      expect(isTokenSymbol('DAI')).toBe(true);
      expect(isTokenSymbol('ARB')).toBe(true);
      expect(isTokenSymbol('BTC')).toBe(true);
      expect(isTokenSymbol('ETH')).toBe(true);
    });

    it('should identify token addresses as not symbols', () => {
      expect(isTokenSymbol('0xA0b86a33E6411B3FCd9Ac3C10e9C8f7a8074f74C')).toBe(false);
      expect(isTokenSymbol('0xaf88d065e77c8cc2239327c5edb3a432268e5831')).toBe(false);
      expect(isTokenSymbol('0x6B175474E89094C44Da98b954EedeAC495271d0F')).toBe(false);
    });

    it('should handle edge cases', () => {
      // Too short
      expect(isTokenSymbol('A')).toBe(false);
      
      // Valid short symbols
      expect(isTokenSymbol('BT')).toBe(true);
      
      // Long but valid symbols
      expect(isTokenSymbol('LONGTOKEN')).toBe(true);
      
      // Too long for typical symbols but not an address
      expect(isTokenSymbol('VERYLONGTOKEN')).toBe(false);
      
      // Partial address (too short)
      expect(isTokenSymbol('0x123')).toBe(false);
      
      // Mixed case symbols
      expect(isTokenSymbol('Usdc')).toBe(true);
      expect(isTokenSymbol('wEth')).toBe(true);
    });

    it('should handle various symbol lengths', () => {
      expect(isTokenSymbol('BT')).toBe(true);      // 2 chars
      expect(isTokenSymbol('ETH')).toBe(true);     // 3 chars
      expect(isTokenSymbol('USDC')).toBe(true);    // 4 chars
      expect(isTokenSymbol('WBTC')).toBe(true);    // 4 chars
      expect(isTokenSymbol('AAVE')).toBe(true);    // 4 chars
      expect(isTokenSymbol('MATIC')).toBe(true);   // 5 chars
      expect(isTokenSymbol('SHIB')).toBe(true);    // 4 chars
      expect(isTokenSymbol('1INCH')).toBe(true);   // 5 chars (with number)
    });

    it('should reject strings that look like addresses', () => {
      // Valid Ethereum addresses
      expect(isTokenSymbol('0x0000000000000000000000000000000000000000')).toBe(false);
      expect(isTokenSymbol('0x1111111111111111111111111111111111111111')).toBe(false);
      expect(isTokenSymbol('0xffffffffffffffffffffffffffffffffffffffff')).toBe(false);
      
      // Mixed case addresses
      expect(isTokenSymbol('0xABCDEF1234567890abcdef1234567890ABCDEF12')).toBe(false);
    });

    it('should handle empty and invalid inputs', () => {
      expect(isTokenSymbol('')).toBe(false);
      expect(isTokenSymbol('0x')).toBe(false);
      expect(isTokenSymbol('0')).toBe(false);
      expect(isTokenSymbol('x')).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete token resolution workflow', () => {
      // Single chain token
      const daiInfo = resolveTokenInfo(mockTokenMap, 'dai');
      expect(daiInfo.address).toBe('0x6B175474E89094C44Da98b954EedeAC495271d0F');
      expect(daiInfo.chainId).toBe('1');
      
      // Multi-chain with preference
      const usdcInfo = resolveTokenInfo(mockTokenMap, 'USDC', '42161');
      expect(usdcInfo.address).toBe('0xaf88d065e77c8cc2239327c5edb3a432268e5831');
      expect(usdcInfo.chainId).toBe('42161');
      
      // Address-only resolution
      const arbAddress = resolveTokenAddress(mockTokenMap, 'ARB', '42161');
      expect(arbAddress).toBe('0x912CE59144191C1204E64559FE8253a0e49E6548');
    });

    it('should provide helpful error messages', () => {
      // Unknown token
      try {
        resolveTokenInfo(mockTokenMap, 'FAKECOIN');
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain('not supported');
        expect((error as Error).message).toContain('Available tokens');
      }
      
      // Multi-chain ambiguity
      try {
        resolveTokenInfo(mockTokenMap, 'USDC');
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain('Multiple chains found');
        expect((error as Error).message).toContain('Chain ID');
      }
    });

    it('should work with different token map structures', () => {
      const alternativeTokenMap = {
        'TEST': [
          { chainId: '999', address: '0x1234567890123456789012345678901234567890', decimals: 8 }
        ]
      };
      
      const result = resolveTokenInfo(alternativeTokenMap, 'TEST');
      expect(result).toEqual({
        chainId: '999',
        address: '0x1234567890123456789012345678901234567890',
        decimals: 8
      });
    });
  });
});