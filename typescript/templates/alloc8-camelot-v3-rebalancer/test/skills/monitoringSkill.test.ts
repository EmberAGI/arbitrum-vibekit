/**
 * Tests for the monitoring skill
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { monitoringSkill } from '../../src/skills/monitoringSkill.js';
import { OperatingMode } from '../../src/config/types.js';
import type { RebalancerContext } from '../../src/context/types.js';

describe('Monitoring Skill', () => {
  let mockContext: RebalancerContext;

  beforeEach(() => {
    mockContext = {
      config: {
        mode: OperatingMode.PASSIVE,
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

  describe('Skill Definition', () => {
    it('should have correct skill metadata', () => {
      expect(monitoringSkill.id).toBe('monitoring-control');
      expect(monitoringSkill.name).toBe('Monitoring Control');
      expect(monitoringSkill.description).toContain('monitoring');
      expect(monitoringSkill.tags).toContain('monitoring');
      expect(monitoringSkill.tags).toContain('automation');
      expect(monitoringSkill.examples).toHaveLength(6);
    });

    it('should have correct input schema', () => {
      const validInput = {
        action: 'start',
        mode: OperatingMode.PASSIVE,
      };

      const result = monitoringSkill.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate required action field', () => {
      const invalidInput = {
        mode: OperatingMode.PASSIVE,
      };

      const result = monitoringSkill.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate action enum values', () => {
      const invalidInput = {
        action: 'invalid',
        mode: OperatingMode.PASSIVE,
      };

      const result = monitoringSkill.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should have three tools', () => {
      expect(monitoringSkill.tools).toHaveLength(3);
      expect(monitoringSkill.tools.map(t => t.name)).toEqual([
        'startMonitoring',
        'stopMonitoring',
        'getMonitoringStatus',
      ]);
    });
  });
});
