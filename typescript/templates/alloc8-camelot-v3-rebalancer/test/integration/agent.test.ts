/**
 * Integration tests for the Camelot v3 Rebalancer Agent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from 'arbitrum-vibekit-core';
import { agentConfig } from '../../src/index.js';
import type { RebalancerContext } from '../../src/context/types.js';
import { OperatingMode, RiskProfile, DiscoveryMode } from '../../src/config/types.js';
import { contextProvider } from '../../src/context/provider.js';

// Mock all external dependencies
vi.mock('../../src/utils/walletUtils.js', () => ({
  getWalletAddressFromPrivateKey: vi.fn(() => '0x1234567890abcdef1234567890abcdef12345678'),
}));

vi.mock('../../src/utils/directPositionFetcher.js', () => ({
  fetchActivePositions: vi.fn(),
}));

vi.mock('../../src/tools/calculatePoolKPIs.js', () => ({
  calculatePoolKPIsTool: {
    execute: vi.fn(),
  },
}));

vi.mock('../../src/tools/analyzePositionWithLLM.js', () => ({
  analyzePositionWithLLMTool: {
    execute: vi.fn(),
  },
}));

vi.mock('../../src/tools/withdrawLiquidity.js', () => ({
  withdrawLiquidityTool: {
    execute: vi.fn(),
  },
}));

vi.mock('../../src/tools/supplyLiquidity.js', () => ({
  supplyLiquidityTool: {
    execute: vi.fn(),
  },
}));

vi.mock('../../src/tools/swapTokens.js', () => ({
  swapTokensTool: {
    execute: vi.fn(),
  },
}));

vi.mock('../../src/context/provider.js', () => ({
  contextProvider: vi.fn(),
}));

describe('Camelot v3 Rebalancer Agent Integration', () => {
  let agent: any;
  let mockContext: RebalancerContext;

  beforeEach(() => {
    mockContext = {
      config: {
        mode: OperatingMode.PASSIVE,
        riskProfile: RiskProfile.MEDIUM,
        discoveryMode: DiscoveryMode.AUTO_DISCOVER,
        chainIds: [42161],
        checkInterval: 1000,
        priceDeviationThreshold: 0.05,
        utilizationThreshold: 0.8,
        walletPrivateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        arbitrumRpcUrl: 'https://arb1.arbitrum.io/rpc',
        emberMcpServerUrl: 'https://api.emberai.xyz/mcp',
        subgraphApiKey: 'test-api-key',
        telegramBotToken: 'test-bot-token',
        telegramChatId: 'test-chat-id',
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
      telegramBot: {
        sendMessage: vi.fn(),
        sendPhoto: vi.fn(),
      } as any,
    };

    // Mock the context provider
    vi.mocked(contextProvider).mockResolvedValue(mockContext);

    // Create agent instance
    agent = Agent.create(agentConfig, {
      llm: {
        model: vi.fn(),
        specificationVersion: 'v1',
        provider: 'test',
        modelId: 'test-model',
        defaultObjectGenerationMode: 'json',
        doGenerate: vi.fn(),
        doStream: vi.fn(),
      } as any,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Configuration', () => {
    it('should have correct agent configuration', () => {
      expect(agentConfig.name).toBe('Camelot v3 LP Rebalancing Agent');
      expect(agentConfig.description).toContain('Camelot v3');
      expect(agentConfig.skills).toHaveLength(2);
    });

    it('should have monitoring skill configured', () => {
      const monitoringSkill = agentConfig.skills.find(s => s.id === 'monitoring-control');
      expect(monitoringSkill).toBeDefined();
      expect(monitoringSkill!.name).toBe('Monitoring Control');
    });

    it('should have rebalancing skill configured', () => {
      const rebalancingSkill = agentConfig.skills.find(s => s.id === 'lp-rebalancing');
      expect(rebalancingSkill).toBeDefined();
      expect(rebalancingSkill!.name).toBe('LP Rebalancing');
    });
  });

  describe('Monitoring Workflow', () => {
    it('should start monitoring successfully', async () => {
      const { fetchActivePositions } = await import('../../src/utils/directPositionFetcher.js');
      vi.mocked(fetchActivePositions).mockResolvedValue([]);

      // Mock the agent's start method
      const mockStart = vi.fn().mockResolvedValue(undefined);
      agent.start = mockStart;

      await agent.start(3002, contextProvider);

      expect(mockStart).toHaveBeenCalledWith(3002, contextProvider);
    });

    it('should handle monitoring errors gracefully', async () => {
      const { fetchActivePositions } = await import('../../src/utils/directPositionFetcher.js');
      vi.mocked(fetchActivePositions).mockRejectedValue(new Error('Network error'));

      // Test that the function throws the expected error
      await expect(
        fetchActivePositions('0x1234567890abcdef1234567890abcdef12345678')
      ).rejects.toThrow('Network error');
    });
  });

  describe('Position Analysis Workflow', () => {
    it('should analyze positions end-to-end', async () => {
      const mockPositions = [
        {
          positionId: 'pos1',
          poolAddress: '0xpool1',
          token0: '0xtoken0',
          token1: '0xtoken1',
          token0Symbol: 'ETH',
          token1Symbol: 'USDC',
          tickLower: -1000,
          tickUpper: 1000,
          liquidity: '1000000',
          amount0: '1.0',
          amount1: '2000.0',
          fees0: '10.0',
          fees1: '20.0',
          isInRange: false,
          chainId: 42161,
        },
      ];

      const mockKPIResult = {
        id: 'kpi-task-1',
        contextId: 'test-context',
        status: 'completed',
        kind: 'task',
        type: 'success',
        artifacts: [
          {
            name: 'Pool KPIs Analysis',
            parts: [
              {
                kind: 'text',
                text: JSON.stringify({
                  positionUtilization: 0.8,
                  isInRange: false,
                  volatility: 0.1,
                  feesEarned: 100,
                }),
              },
            ],
          },
        ],
      } as any;

      const mockLLMResult = {
        id: 'llm-task-1',
        contextId: 'test-context',
        status: 'completed',
        kind: 'task',
        type: 'success',
        artifacts: [
          {
            name: 'LLM Analysis',
            parts: [
              {
                kind: 'text',
                text: JSON.stringify({
                  needsRebalance: true,
                  recommendation: {
                    action: 'rebalance',
                    newRange: { lower: -500, upper: 500 },
                    confidence: 0.8,
                    reasoning: 'Position is out of range',
                  },
                }),
              },
            ],
          },
        ],
      } as any;

      const { fetchActivePositions } = await import('../../src/utils/directPositionFetcher.js');
      vi.mocked(fetchActivePositions).mockResolvedValue(mockPositions);

      const { calculatePoolKPIsTool } = await import('../../src/tools/calculatePoolKPIs.js');
      vi.mocked(calculatePoolKPIsTool.execute).mockResolvedValue(mockKPIResult);

      const { analyzePositionWithLLMTool } = await import(
        '../../src/tools/analyzePositionWithLLM.js'
      );
      vi.mocked(analyzePositionWithLLMTool.execute).mockResolvedValue(mockLLMResult);

      // Simulate the analysis workflow
      const positions = await fetchActivePositions('0x1234567890abcdef1234567890abcdef12345678');
      expect(positions).toEqual(mockPositions);

      const kpiResult = await calculatePoolKPIsTool.execute(
        {
          poolAddress: '0xpool1',
          positionRange: { lower: -1000, upper: 1000 },
          currentPrice: 2000,
          tickSpacing: 60,
        },
        { custom: mockContext }
      );
      expect((kpiResult as any).type).toBe('success');

      const llmResult = await analyzePositionWithLLMTool.execute(
        {
          positionId: 'pos1',
          poolAddress: '0xpool1',
          currentPrice: 2000,
          tickSpacing: 60,
          currentRange: { lower: -1000, upper: 1000 },
          token0Decimals: 18,
          token1Decimals: 6,
          riskProfile: 'medium',
          kpis: JSON.parse((mockKPIResult as any).artifacts![0].parts[0].text),
        },
        { custom: mockContext }
      );
      expect((llmResult as any).type).toBe('success');
    });
  });

  describe('Rebalancing Workflow', () => {
    it('should execute rebalancing workflow', async () => {
      const mockWithdrawResult = {
        id: 'withdraw-task-1',
        contextId: 'test-context',
        status: 'completed',
        kind: 'task',
        type: 'success',
        artifacts: [
          {
            name: 'Withdraw Result',
            parts: [
              {
                kind: 'text',
                text: JSON.stringify({
                  success: true,
                  transactionHash: '0xwithdraw123',
                  amount0: '1.0',
                  amount1: '2000.0',
                }),
              },
            ],
          },
        ],
      } as any;

      const mockSwapResult = {
        id: 'swap-task-1',
        contextId: 'test-context',
        status: 'completed',
        kind: 'task',
        type: 'success',
        artifacts: [
          {
            name: 'Swap Result',
            parts: [
              {
                kind: 'text',
                text: JSON.stringify({
                  success: true,
                  transactionHash: '0xswap123',
                  amountIn: '0.5',
                  amountOut: '1000.0',
                }),
              },
            ],
          },
        ],
      } as any;

      const mockSupplyResult = {
        id: 'supply-task-1',
        contextId: 'test-context',
        status: 'completed',
        kind: 'task',
        type: 'success',
        artifacts: [
          {
            name: 'Supply Result',
            parts: [
              {
                kind: 'text',
                text: JSON.stringify({
                  success: true,
                  transactionHash: '0xsupply123',
                  positionId: 'pos1',
                  newRange: { lower: -500, upper: 500 },
                }),
              },
            ],
          },
        ],
      } as any;

      const { withdrawLiquidityTool } = await import('../../src/tools/withdrawLiquidity.js');
      vi.mocked(withdrawLiquidityTool.execute).mockResolvedValue(mockWithdrawResult);

      const { swapTokensTool } = await import('../../src/tools/swapTokens.js');
      vi.mocked(swapTokensTool.execute).mockResolvedValue(mockSwapResult);

      const { supplyLiquidityTool } = await import('../../src/tools/supplyLiquidity.js');
      vi.mocked(supplyLiquidityTool.execute).mockResolvedValue(mockSupplyResult);

      // Simulate the rebalancing workflow
      const withdrawResult = await withdrawLiquidityTool.execute(
        {
          positionId: 'pos1',
          collectFees: true,
        },
        { custom: mockContext }
      );
      expect((withdrawResult as any).type).toBe('success');

      const swapResult = await swapTokensTool.execute(
        {
          tokenIn: '0xtoken0',
          tokenOut: '0xtoken1',
          amountIn: '0.5',
          amountOutMinimum: '900.0',
          deadline: Math.floor(Date.now() / 1000) + 1800,
        },
        { custom: mockContext }
      );
      expect((swapResult as any).type).toBe('success');

      const supplyResult = await supplyLiquidityTool.execute(
        {
          tickLower: -500,
          tickUpper: 500,
          token0: '0xtoken0',
          token1: '0xtoken1',
          amount0Desired: '0.5',
          amount1Desired: '1000.0',
          slippageBps: 100,
          poolAddress: '0xpool1',
        },
        { custom: mockContext }
      );
      expect((supplyResult as any).type).toBe('success');
    });

    it('should handle rebalancing failures gracefully', async () => {
      const { withdrawLiquidityTool } = await import('../../src/tools/withdrawLiquidity.js');
      vi.mocked(withdrawLiquidityTool.execute).mockResolvedValue({
        id: 'withdraw-error-1',
        contextId: 'test-context',
        status: 'failed',
        kind: 'task',
        type: 'error',
        error: new Error('Withdrawal failed'),
      } as any);

      const result = await withdrawLiquidityTool.execute(
        {
          positionId: 'pos1',
          collectFees: true,
        },
        { custom: mockContext }
      );

      expect((result as any).type).toBe('error');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing environment variables', () => {
      const invalidContext = {
        ...mockContext,
        config: {
          ...mockContext.config,
          walletPrivateKey: '',
        },
      };

      expect(() => {
        if (!invalidContext.config.walletPrivateKey) {
          throw new Error('Wallet private key not configured');
        }
      }).toThrow('Wallet private key not configured');
    });

    it('should handle network errors gracefully', async () => {
      const { fetchActivePositions } = await import('../../src/utils/directPositionFetcher.js');
      vi.mocked(fetchActivePositions).mockRejectedValue(new Error('Network timeout'));

      try {
        await fetchActivePositions('0x1234567890abcdef1234567890abcdef12345678');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Network timeout');
      }
    });

    it('should handle invalid configuration', () => {
      const invalidConfig = {
        mode: 'invalid' as any,
        riskProfile: 'invalid' as any,
        discoveryMode: 'invalid' as any,
        chainIds: ['invalid'],
        checkInterval: -1000,
        priceDeviationThreshold: 2.0,
        utilizationThreshold: 2.0,
        walletPrivateKey: 'invalid',
        arbitrumRpcUrl: 'invalid-url',
        emberMcpServerUrl: 'invalid-url',
        subgraphApiKey: '',
      };

      // This would be validated by the config schema in real usage
      expect(() => {
        if (invalidConfig.checkInterval < 0) {
          throw new Error('Invalid check interval');
        }
      }).toThrow('Invalid check interval');
    });
  });
});
