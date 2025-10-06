/**
 * Tests for the calculatePoolKPIs tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculatePoolKPIsTool } from '../../src/tools/calculatePoolKPIs.js';
import type { RebalancerContext } from '../../src/context/types.js';

// Mock the dependencies
vi.mock('graphql-request', () => ({
  request: vi.fn(),
  gql: vi.fn((query: string) => query),
}));

vi.mock('../../src/config/index.js', () => ({
  loadAgentConfig: vi.fn(() => ({
    subgraphApiKey: 'test-api-key',
  })),
}));

describe('Calculate Pool KPIs Tool', () => {
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
      expect(calculatePoolKPIsTool.name).toBe('calculatePoolKPIs');
      expect(calculatePoolKPIsTool.description).toContain('comprehensive KPIs');
      expect(calculatePoolKPIsTool.parameters).toBeDefined();
    });

    it('should have correct parameter schema', () => {
      const validParams = {
        poolAddress: '0x1234567890abcdef1234567890abcdef12345678',
        positionRange: {
          lower: -1000,
          upper: 1000,
        },
        currentPrice: 2000.0,
        tickSpacing: 60,
      };

      const result = calculatePoolKPIsTool.parameters.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should accept optional tickSpacing parameter', () => {
      const minimalParams = {
        poolAddress: '0x1234567890abcdef1234567890abcdef12345678',
        positionRange: {
          lower: -1000,
          upper: 1000,
        },
        currentPrice: 2000.0,
      };

      const result = calculatePoolKPIsTool.parameters.safeParse(minimalParams);
      expect(result.success).toBe(true);
    });

    it('should validate poolAddress as string', () => {
      const invalidParams = {
        poolAddress: 123,
        positionRange: { lower: -1000, upper: 1000 },
        currentPrice: 2000.0,
      };

      const result = calculatePoolKPIsTool.parameters.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should validate positionRange structure', () => {
      const invalidParams = {
        poolAddress: '0x1234567890abcdef1234567890abcdef12345678',
        positionRange: { lower: 'invalid', upper: 1000 },
        currentPrice: 2000.0,
      };

      const result = calculatePoolKPIsTool.parameters.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should validate currentPrice as number', () => {
      const invalidParams = {
        poolAddress: '0x1234567890abcdef1234567890abcdef12345678',
        positionRange: { lower: -1000, upper: 1000 },
        currentPrice: 'invalid',
      };

      const result = calculatePoolKPIsTool.parameters.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });
});
