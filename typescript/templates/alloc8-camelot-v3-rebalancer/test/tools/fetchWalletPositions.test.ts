/**
 * Tests for the fetchWalletPositions tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWalletPositionsTool } from '../../src/tools/fetchWalletPositions.js';
import type { RebalancerContext } from '../../src/context/types.js';

// Mock the dependencies
vi.mock('../../src/utils/walletUtils.js', () => ({
  getWalletAddressFromPrivateKey: vi.fn(() => '0x1234567890abcdef1234567890abcdef12345678'),
}));

vi.mock('../../src/utils/directPositionFetcher.js', () => ({
  fetchActivePositions: vi.fn(),
  fetchMultipleWalletPositions: vi.fn(),
}));

describe('Fetch Wallet Positions Tool', () => {
  let mockContext: RebalancerContext;

  beforeEach(() => {
    mockContext = {
      config: {
        mode: 'passive' as any,
        riskProfile: 'medium' as any,
        discoveryMode: 'auto-discover' as any,
        chainIds: [42161],
        checkInterval: 3600000,
        priceDeviationThreshold: 0.05,
        utilizationThreshold: 0.8,
        walletPrivateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        arbitrumRpcUrl: 'https://arb1.arbitrum.io/rpc',
        emberMcpServerUrl: 'https://api.emberai.xyz/mcp',
        subgraphApiKey: 'test-api-key',
      },
      mcpClients: {},
      rpcProvider: {
        url: 'https://arb1.arbitrum.io/rpc',
      },
      monitoringState: {
        isActive: false,
        currentPositions: [],
        lastCheck: null,
        taskId: null,
      },
    };
  });

  describe('Tool Definition', () => {
    it('should have correct tool metadata', () => {
      expect(fetchWalletPositionsTool.name).toBe('fetchWalletPositions');
      expect(fetchWalletPositionsTool.description).toContain('Camelot v3 LP positions');
      expect(fetchWalletPositionsTool.parameters).toBeDefined();
    });

    it('should have correct parameter schema', () => {
      const validParams = {
        chainIds: [42161, 1],
        activeOnly: true,
      };

      const result = fetchWalletPositionsTool.parameters.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should accept optional parameters', () => {
      const minimalParams = {};

      const result = fetchWalletPositionsTool.parameters.safeParse(minimalParams);
      expect(result.success).toBe(true);
    });

    it('should validate chainIds as array of numbers', () => {
      const invalidParams = {
        chainIds: ['invalid'],
      };

      const result = fetchWalletPositionsTool.parameters.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should validate activeOnly as boolean', () => {
      const invalidParams = {
        activeOnly: 'invalid',
      };

      const result = fetchWalletPositionsTool.parameters.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });
});
