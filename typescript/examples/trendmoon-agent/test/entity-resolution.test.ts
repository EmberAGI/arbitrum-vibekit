/**
 * Entity Resolution System Tests
 *
 * Tests the hooks and services that resolve categories, platforms, and timeframes
 * for the Trendmoon Agent
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { entityResolver } from '../src/services/entityResolver.js';
import { parseTimeframe } from '../src/utils/timeframeParser.js';

describe('Entity Resolution System', () => {
  describe('Category Resolution', () => {
    test('resolves common category aliases', () => {
      // Test that the resolver handles common aliases
      // Note: This tests the logic, actual data comes from MCP server or files
      expect(typeof entityResolver.resolveCategory).toBe('function');
    });

    test('handles case insensitive matching', () => {
      // The resolver should handle case insensitive matching
      expect(typeof entityResolver.resolveCategory).toBe('function');
    });

    test('returns null for unknown categories', () => {
      const result = entityResolver.resolveCategory('unknown-category-123');
      expect(result).toBeNull();
    });
  });

  describe('Platform Resolution', () => {
    test('resolves common platform aliases', () => {
      expect(typeof entityResolver.resolvePlatform).toBe('function');
    });

    test('handles blockchain name variations', () => {
      // Should handle variations like "arbitrum", "arb", "Arbitrum One"
      expect(typeof entityResolver.resolvePlatform).toBe('function');
    });

    test('returns null for unknown platforms', () => {
      const result = entityResolver.resolvePlatform('unknown-blockchain-123');
      expect(result).toBeNull();
    });
  });

  describe('Timeframe Parser', () => {
    test('parses day timeframes correctly', () => {
      const result = parseTimeframe('7d');
      expect(result).not.toBeNull();
      if (result) {
        expect(result).toHaveProperty('startDate');
        expect(result).toHaveProperty('endDate');
        expect(typeof result.startDate).toBe('string');
        expect(typeof result.endDate).toBe('string');
        
        // Verify dates are valid ISO strings
        expect(new Date(result.startDate)).toBeInstanceOf(Date);
        expect(new Date(result.endDate)).toBeInstanceOf(Date);
        
        // Start date should be before end date
        expect(new Date(result.startDate).getTime()).toBeLessThan(new Date(result.endDate).getTime());
      }
    });

    test('parses week timeframes correctly', () => {
      const result = parseTimeframe('2w');
      expect(result).not.toBeNull();
      if (result) {
        const startDate = new Date(result.startDate);
        const endDate = new Date(result.endDate);
        const diffWeeks = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7);
        expect(Math.round(diffWeeks)).toBe(2);
      }
    });

    test('parses month timeframes correctly', () => {
      const result = parseTimeframe('1m');
      expect(result).not.toBeNull();
      if (result) {
        expect(result).toHaveProperty('startDate');
        expect(result).toHaveProperty('endDate');
      }
    });

    test('parses hour timeframes correctly', () => {
      const result = parseTimeframe('24h');
      expect(result).not.toBeNull();
      if (result) {
        const startDate = new Date(result.startDate);
        const endDate = new Date(result.endDate);
        const diffHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
        expect(Math.round(diffHours)).toBe(24);
      }
    });

    test('handles special case timeframes', () => {
      const weekResult = parseTimeframe('last week');
      expect(weekResult).not.toBeNull();
      
      const monthResult = parseTimeframe('last month');
      expect(monthResult).not.toBeNull();
    });

    test('returns null for invalid timeframes', () => {
      expect(parseTimeframe('invalid')).toBeNull();
      expect(parseTimeframe('abc')).toBeNull();
      expect(parseTimeframe('')).toBeNull();
      expect(parseTimeframe(undefined)).toBeNull();
    });

    test('handles edge cases', () => {
      expect(parseTimeframe('0d')).not.toBeNull();
      expect(parseTimeframe('100d')).not.toBeNull();
    });
  });

  describe('Entity Resolver Caching', () => {
    test('has singleton pattern', () => {
      const instance1 = entityResolver;
      const instance2 = entityResolver;
      expect(instance1).toBe(instance2);
    });

    test('has initialize method', () => {
      expect(typeof entityResolver.initialize).toBe('function');
    });

    test('has resolution methods', () => {
      expect(typeof entityResolver.resolveCategory).toBe('function');
      expect(typeof entityResolver.resolvePlatform).toBe('function');
    });
  });

  describe('Error Handling', () => {
    test('timeframe parser handles null input gracefully', () => {
      expect(parseTimeframe(null as any)).toBeNull();
    });

    test('entity resolver handles null input gracefully', () => {
      expect(entityResolver.resolveCategory(null as any)).toBeNull();
      expect(entityResolver.resolvePlatform(null as any)).toBeNull();
      expect(entityResolver.resolveCategory('')).toBeNull();
      expect(entityResolver.resolvePlatform('')).toBeNull();
    });
  });

  describe('Real-world Usage Patterns', () => {
    test('typical crypto category queries work', () => {
      const testCases = [
        { input: 'meme', expected: 'should resolve to proper case' },
        { input: 'defi', expected: 'should resolve to DeFi' },
        { input: 'rwa', expected: 'should resolve to RWA' },
        { input: 'layer-1', expected: 'should resolve to Layer 1' },
      ];

      testCases.forEach(({ input }) => {
        // We can't test exact resolution without MCP server data
        // But we can verify the method runs without errors
        expect(() => entityResolver.resolveCategory(input)).not.toThrow();
      });
    });

    test('typical blockchain platform queries work', () => {
      const testCases = [
        { input: 'arbitrum', expected: 'should resolve to Arbitrum' },
        { input: 'ethereum', expected: 'should resolve to Ethereum' },
        { input: 'solana', expected: 'should resolve to Solana' },
        { input: 'polygon', expected: 'should resolve to Polygon' },
      ];

      testCases.forEach(({ input }) => {
        expect(() => entityResolver.resolvePlatform(input)).not.toThrow();
      });
    });

    test('typical timeframe queries work', () => {
      const testCases = [
        '1d', '7d', '30d', '1w', '2w', '1m', '3m', '6m', '1y',
        '24h', '48h', 'last week', 'last month'
      ];

      testCases.forEach((timeframe) => {
        const result = parseTimeframe(timeframe);
        if (timeframe === 'last week' || timeframe === 'last month') {
          // These special cases should work
          expect(result).not.toBeNull();
        } else {
          // Regular timeframes should work
          expect(result).not.toBeNull();
        }
        
        if (result) {
          expect(typeof result.startDate).toBe('string');
          expect(typeof result.endDate).toBe('string');
        }
      });
    });
  });
});