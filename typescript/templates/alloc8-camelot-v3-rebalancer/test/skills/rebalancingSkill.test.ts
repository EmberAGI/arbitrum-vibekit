/**
 * Tests for the rebalancing skill
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rebalancingSkill } from '../../src/skills/rebalancingSkill.js';
import type { RebalancerContext } from '../../src/context/types.js';

describe('Rebalancing Skill', () => {
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

  describe('Skill Definition', () => {
    it('should have correct skill metadata', () => {
      expect(rebalancingSkill.id).toBe('lp-rebalancing');
      expect(rebalancingSkill.name).toBe('LP Rebalancing');
      expect(rebalancingSkill.description).toContain('Camelot v3');
      expect(rebalancingSkill.tags).toContain('defi');
      expect(rebalancingSkill.tags).toContain('liquidity');
      expect(rebalancingSkill.tags).toContain('camelot');
      expect(rebalancingSkill.examples).toHaveLength(9);
    });

    it('should have correct input schema', () => {
      const validInput = {
        instruction: 'Analyze my current LP positions',
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        poolAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      };

      const result = rebalancingSkill.inputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate required instruction field', () => {
      const invalidInput = {
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      };

      const result = rebalancingSkill.inputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should allow optional wallet and pool addresses', () => {
      const minimalInput = {
        instruction: 'Analyze my current LP positions',
      };

      const result = rebalancingSkill.inputSchema.safeParse(minimalInput);
      expect(result.success).toBe(true);
    });

    it('should have MCP server configuration', () => {
      expect(rebalancingSkill.mcpServers).toBeDefined();
      expect(rebalancingSkill.mcpServers!['ember-onchain']).toBeDefined();
      const mcpConfig = rebalancingSkill.mcpServers!['ember-onchain'];
      if ('url' in mcpConfig) {
        expect(mcpConfig.url).toBe('https://api.emberai.xyz/mcp');
      }
    });

    it('should have all required tools', () => {
      expect(rebalancingSkill.tools).toHaveLength(10);

      const toolNames = rebalancingSkill.tools.map(t => t.name);
      expect(toolNames).toContain('getWalletLiquidityPositions');
      expect(toolNames).toContain('fetchWalletPositions');
      expect(toolNames).toContain('getLiquidityPools');
      expect(toolNames).toContain('getTokenMarketData');
      expect(toolNames).toContain('withdrawLiquidity');
      expect(toolNames).toContain('supplyLiquidity');
      expect(toolNames).toContain('swapTokens');
      expect(toolNames).toContain('getWalletBalances');
      expect(toolNames).toContain('calculatePoolKPIs');
      expect(toolNames).toContain('analyzePositionWithLLM');
    });
  });

  describe('Input Schema Validation', () => {
    it('should accept valid instruction strings', () => {
      const validInstructions = [
        'Analyze my current LP positions',
        'Check if my ETH/USDC position needs rebalancing',
        'Rebalance my position to optimal range',
        'Withdraw liquidity from position 123',
        'Supply liquidity to ETH/USDC pool',
        'Get market data for my tokens',
        'What are my current token balances?',
        'Show me all positions across all chains',
      ];

      validInstructions.forEach(instruction => {
        const result = rebalancingSkill.inputSchema.safeParse({ instruction });
        expect(result.success).toBe(true);
      });
    });

    it('should accept valid wallet addresses', () => {
      const validWallets = [
        '0x1234567890abcdef1234567890abcdef12345678',
        '0xabcdef1234567890abcdef1234567890abcdef12',
        '0x0000000000000000000000000000000000000000',
      ];

      validWallets.forEach(walletAddress => {
        const result = rebalancingSkill.inputSchema.safeParse({
          instruction: 'test',
          walletAddress,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept valid pool addresses', () => {
      const validPools = [
        '0x1234567890abcdef1234567890abcdef12345678',
        '0xabcdef1234567890abcdef1234567890abcdef12',
        '0x0000000000000000000000000000000000000000',
      ];

      validPools.forEach(poolAddress => {
        const result = rebalancingSkill.inputSchema.safeParse({
          instruction: 'test',
          poolAddress,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept empty instruction (no validation)', () => {
      const result = rebalancingSkill.inputSchema.safeParse({ instruction: '' });
      expect(result.success).toBe(true);
    });

    it('should reject non-string instruction', () => {
      const result = rebalancingSkill.inputSchema.safeParse({ instruction: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe('MCP Server Configuration', () => {
    it('should have MCP server URL configuration', () => {
      const mcpConfig = rebalancingSkill.mcpServers!['ember-onchain'];
      if ('url' in mcpConfig) {
        expect(mcpConfig.url).toBeDefined();
        expect(typeof mcpConfig.url).toBe('string');
        expect(mcpConfig.url).toContain('api.emberai.xyz');
      }
    });

    it('should have correct headers configuration', () => {
      const mcpConfig = rebalancingSkill.mcpServers!['ember-onchain'];
      if ('headers' in mcpConfig) {
        expect(mcpConfig.headers).toEqual({
          'Content-Type': 'application/json',
        });
      }
    });
  });
});
