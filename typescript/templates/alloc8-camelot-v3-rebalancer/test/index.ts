/**
 * Test index file - exports all test utilities and helpers
 */

// Re-export test setup
export * from './setup.js';

// Test utilities
export const testUtils = {
  createMockContext: () => ({
    config: {
      mode: 'passive' as any,
      riskProfile: 'medium' as any,
      discoveryMode: 'auto-discover' as any,
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
  }),

  createMockPosition: (overrides = {}) => ({
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
    ...overrides,
  }),

  createMockEvaluation: (overrides = {}) => ({
    positionId: 'pos1',
    poolAddress: '0xpool1',
    currentPrice: 2000,
    priceDeviation: 0.1,
    needsRebalance: true,
    currentRange: { lower: -1000, upper: 1000 },
    isInRange: false,
    liquidity: '1000000',
    fees: { token0: '10.0', token1: '20.0' },
    token0: '0xtoken0',
    token1: '0xtoken1',
    token0Symbol: 'ETH',
    token1Symbol: 'USDC',
    recommendation: {
      action: 'rebalance',
      newRange: { lower: -500, upper: 500 },
      confidence: 0.8,
      reasoning: 'Position is out of range and needs rebalancing',
    },
    timestamp: new Date(),
    ...overrides,
  }),
};

// Import vi for the mock functions
import { vi } from 'vitest';
