import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies for end-to-end testing
vi.mock('arbitrum-vibekit-core', () => ({
  createSuccessTask: vi.fn().mockImplementation((name, artifacts, message) => ({
    status: { state: 'completed' },
    artifacts,
    message
  })),
  createErrorTask: vi.fn().mockImplementation((name, error) => ({
    status: { state: 'failed' },
    error: error.message
  })),
  parseMcpToolResponsePayload: vi.fn().mockImplementation((result, schema) => result.structuredContent),
  defineSkill: vi.fn().mockImplementation((config) => config),
  getAvailableProviders: vi.fn().mockReturnValue(['openrouter']),
  createProviderSelector: vi.fn().mockReturnValue({
    openrouter: vi.fn().mockReturnValue({
      modelId: 'test-model',
      provider: 'openrouter'
    })
  })
}));

vi.mock('ember-schemas', () => ({
  GetWalletLendingPositionsResponseSchema: {
    parse: vi.fn().mockImplementation((data) => data)
  },
  RepayResponseSchema: {
    parse: vi.fn().mockImplementation((data) => data)
  },
  SupplyResponseSchema: {
    parse: vi.fn().mockImplementation((data) => data)
  },
  TransactionPlanSchema: {
    parse: vi.fn().mockImplementation((data) => data)
  }
}));

vi.mock('viem', () => ({
  createPublicClient: vi.fn().mockReturnValue({
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn()
  }),
  createWalletClient: vi.fn().mockReturnValue({
    sendTransaction: vi.fn()
  }),
  http: vi.fn(),
  formatUnits: vi.fn().mockReturnValue('1000'),
  isHex: vi.fn().mockReturnValue(true),
  hexToString: vi.fn(),
  BaseError: class BaseError extends Error {},
  ContractFunctionRevertedError: class ContractFunctionRevertedError extends Error {},
  arbitrum: { id: 42161, name: 'Arbitrum One' },
}));

vi.mock('ai', () => ({
  generateText: vi.fn()
}));

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn()
  }
}));

// Mock fetch for CoinGecko API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console to reduce noise
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('End-to-End: Liquidation Prevention Agent', () => {
  let mockContext: any;
  let mockMcpClient: any;
  let mockExecuteTransaction: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock MCP client
    mockMcpClient = {
      callTool: vi.fn()
    };

    // Setup mock transaction executor
    mockExecuteTransaction = vi.fn().mockResolvedValue('Transaction executed successfully');

    // Setup comprehensive mock context
    mockContext = {
      custom: {
        mcpClient: mockMcpClient,
        executeTransaction: mockExecuteTransaction,
        tokenMap: {
          USDC: [{ address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', chainId: '42161', decimals: 6 }],
          WETH: [{ address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', chainId: '42161', decimals: 18 }],
          DAI: [{ address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', chainId: '42161', decimals: 18 }]
        },
        thresholds: {
          warning: 1.5,
          danger: 1.2,
          critical: 1.05
        },
        monitoring: {
          enabled: true,
          interval: 300
        },
        quicknode: {
          subdomain: 'test-subdomain',
          apiKey: 'test-api-key'
        }
      }
    };

    // Setup default fetch mock for CoinGecko API
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { usd: 1.0 },
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { usd: 2500.0 },
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { usd: 1.0 }
      })
    });

    // Setup environment variables
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Complete Liquidation Prevention Workflow', () => {
    it('should complete full liquidation prevention workflow for critical health factor', async () => {
      // Import all tools needed for the workflow
      const { getUserPositionsTool } = await import('../../src/tools/getUserPositions.js');
      const { supplyCollateralTool } = await import('../../src/tools/supplyCollateral.js');

      // Step 1: Check current position - CRITICAL health factor detected
      const criticalPositionData = {
        structuredContent: {
          positions: [{
            healthFactor: '1.02', // CRITICAL!
            totalCollateralUsd: '5000',
            totalBorrowsUsd: '4800',
            userReserves: [{
              underlyingBalance: '2000',
              variableBorrows: '1800',
              token: {
                symbol: 'USDC',
                tokenUid: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                decimals: 6
              }
            }]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValueOnce({
        isError: false,
        structuredContent: criticalPositionData.structuredContent
      });

      const positionResult = await getUserPositionsTool.execute({
        userAddress: '0x123...abc',
        instruction: 'Check my current health factor and liquidation risk'
      }, mockContext);

      expect(positionResult.status.state).toBe('completed');
      expect(positionResult.message).toContain('1.0200'); // Critical HF
      expect(positionResult.message).toContain('CRITICAL');

      // Step 2: Execute supply action directly (skipping strategy analysis for simplicity)
      const mockSupplyResponse = {
        structuredContent: {
          transactions: [{
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xsupply123456',
            value: '0',
            chainId: '42161'
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValueOnce({
        isError: false,
        structuredContent: mockSupplyResponse.structuredContent
      });

      const supplyResult = await supplyCollateralTool.execute({
        tokenSymbol: 'USDC',
        amount: '2000',
        userAddress: '0x123...abc',
        instruction: 'Supply collateral to prevent liquidation - emergency action'
      }, mockContext);

      expect(supplyResult.status.state).toBe('completed');
      expect(supplyResult.message).toContain('Successfully supplied 2000 USDC');
      expect(mockExecuteTransaction).toHaveBeenCalledWith('supply-collateral', [{
        type: 'EVM_TX',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0xsupply123456',
        value: '0',
        chainId: '42161'
      }]);

      // Verify the workflow executed successfully
      expect(mockMcpClient.callTool).toHaveBeenCalledTimes(2); // 1 position call + 1 supply call
      expect(mockExecuteTransaction).toHaveBeenCalledTimes(1);
    });

    it('should complete monitoring and automatic prevention workflow', async () => {
      const { monitorHealthTool } = await import('../../src/tools/monitorHealth.js');
      const { intelligentPreventionStrategyTool } = await import('../../src/tools/intelligentPreventionStrategy.js');

      // Mock initial health check - WARNING level
      const warningPositionData = {
        structuredContent: {
          positions: [{
            healthFactor: '1.4', // WARNING level
            totalCollateralUsd: '8000',
            totalBorrowsUsd: '5500',
            userReserves: [{
              underlyingBalance: '5000',
              variableBorrows: '3000',
              token: {
                symbol: 'WETH',
                tokenUid: { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' },
                decimals: 18
              }
            }]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: warningPositionData.structuredContent
      });

      // Start monitoring
      const monitoringResult = await monitorHealthTool.execute({
        userAddress: '0x456...def',
        intervalMinutes: 1,
        enableAlerts: true,
        instruction: 'Monitor my position and prevent liquidation automatically'
      }, mockContext);

      expect(monitoringResult.status.state).toBe('completed');
      expect(monitoringResult.message).toContain('Automatic liquidation prevention activated');
      expect(monitoringResult.message).toContain('Current HF: 1.4000');
      expect(monitoringResult.message).toContain('WARNING');

      // Verify monitoring session was created
      const { getMonitoringSession } = await import('../../src/tools/monitorHealth.js');
      const session = getMonitoringSession('0x456...def');
      expect(session).toBeDefined();
      expect(session?.isActive).toBe(true);
      expect(session?.alerts).toHaveLength(1);
      expect(session?.alerts[0]?.riskLevel).toBe('WARNING');
    });

    it('should handle multi-step liquidation prevention with debt repayment', async () => {
      const { repayDebtTool } = await import('../../src/tools/repayDebt.js');
      const { intelligentPreventionStrategyTool } = await import('../../src/tools/intelligentPreventionStrategy.js');

      // Mock position data showing high debt
      const highDebtPositionData = {
        structuredContent: {
          positions: [{
            healthFactor: '1.08',
            totalCollateralUsd: '12000',
            totalBorrowsUsd: '10000',
            userReserves: [{
              underlyingBalance: '6000',
              variableBorrows: '5000',
              token: {
                symbol: 'DAI',
                tokenUid: { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1' },
                decimals: 18
              }
            }]
          }]
        }
      };

      // Mock position data for liquidation data generation
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: highDebtPositionData.structuredContent
      });

      // Mock wallet balance check
      const { createPublicClient } = vi.mocked(await import('viem'));
      const mockPublicClient = vi.mocked(createPublicClient()).readContract;
      mockPublicClient
        .mockResolvedValueOnce([BigInt(0), BigInt(0), BigInt(8400), BigInt(0), BigInt(0), false, false, false, false, false]) // liquidation threshold
        .mockResolvedValueOnce(BigInt('3000000000000000000000')); // 3000 DAI available

      // Mock LLM recommendation for debt repayment
      const { generateText } = vi.mocked(await import('ai'));
      generateText.mockResolvedValue({
        response: {
          messages: [{
            content: [{
              type: 'text',
              text: JSON.stringify({
                currentAnalysis: {
                  currentHF: '1.08',
                  targetHF: '1.5',
                  requiredIncrease: '0.42'
                },
                recommendedActions: [{
                  actionType: 'REPAY',
                  asset: 'DAI',
                  amountUsd: '2000',
                  amountToken: '2000',
                  expectedHealthFactor: '1.55',
                  priority: 1
                }],
                optimalAction: {
                  actionType: 'REPAY',
                  asset: 'DAI',
                  amountUsd: '2000',
                  amountToken: '2000',
                  expectedHealthFactor: '1.55',
                  priority: 1
                }
              })
            }]
          }]
        }
      });

      // Mock MCP response for repayDebt tool that will be called by intelligentPreventionStrategy
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: {
          transactions: [{
            type: 'approval',
            tokenAddress: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
            spenderAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            amount: '2000000000000000000000',
            description: 'Approve DAI for repayment',
            chainId: 42161,
            userAddress: '0x789...ghi'
          }, {
            type: 'repay',
            tokenAddress: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
            amount: '2000000000000000000000',
            interestRateMode: 2,
            description: 'Repay 2000 DAI debt',
            chainId: 42161,
            userAddress: '0x789...ghi'
          }]
        }
      });

      // Get AI recommendation
      const strategyResult = await intelligentPreventionStrategyTool.execute({
        userAddress: '0x789...ghi',
        targetHealthFactor: 1.5,
        instruction: 'Optimize my position - prefer debt repayment strategy'
      }, mockContext);

      expect(strategyResult.status.state).toBe('completed');
      expect(strategyResult.message).toContain('REPAY 2000 DAI');

      // Execute debt repayment with multi-step transaction (approval + repay)
      const mockRepayResponse = {
        structuredContent: {
          transactions: [
            {
              type: 'EVM_TX',
              to: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
              data: '0xapprove789',
              value: '0',
              chainId: '42161'
            },
            {
              type: 'EVM_TX',
              to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
              data: '0xrepay123',
              value: '0',
              chainId: '42161'
            }
          ]
        }
      };

      mockMcpClient.callTool.mockResolvedValueOnce({
        isError: false,
        structuredContent: mockRepayResponse.structuredContent
      });

      const repayResult = await repayDebtTool.execute({
        tokenSymbol: 'DAI',
        amount: '2000',
        userAddress: '0x789...ghi',
        instruction: 'Repay debt based on AI recommendation to improve health factor'
      }, mockContext);

      expect(repayResult.status.state).toBe('completed');
      expect(repayResult.message).toContain('Successfully repaid 2000 DAI');
      expect(mockExecuteTransaction).toHaveBeenCalledWith('repay-debt', [
        {
          type: 'EVM_TX',
          to: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
          data: '0xapprove789',
          value: '0',
          chainId: '42161'
        },
        {
          type: 'EVM_TX',
          to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
          data: '0xrepay123',
          value: '0',
          chainId: '42161'
        }
      ]);
    });
  });

  describe('Skills Integration', () => {
    it('should execute position status skill workflow', async () => {
      const { getUserPositionsTool } = await import('../../src/tools/getUserPositions.js');
      const { getWalletBalancesTool } = await import('../../src/tools/getWalletBalances.js');

      // Mock position data
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: {
          positions: [{
            healthFactor: '2.1',
            totalCollateralUsd: '15000',
            totalBorrowsUsd: '7000',
            userReserves: [{
              underlyingBalance: '8000',
              variableBorrows: '3500',
              token: {
                symbol: 'USDC',
                tokenUid: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                decimals: 6
              }
            }]
          }]
        }
      });

      // Execute position check
      const positionResult = await getUserPositionsTool.execute({
        userAddress: '0xabc...123',
        instruction: 'Check my liquidation risk and health factor'
      }, mockContext);

      expect(positionResult.status.state).toBe('completed');
      expect(positionResult.message).toContain('2.1000');
      expect(positionResult.message).toContain('SAFE');

      // Execute wallet balance check
      const { createPublicClient, formatUnits } = vi.mocked(await import('viem'));
      const mockPublicClient = vi.mocked(createPublicClient()).readContract;
      mockPublicClient.mockResolvedValue(BigInt('5000000000'));
      vi.mocked(formatUnits).mockReturnValue('5000');

      const walletResult = await getWalletBalancesTool.execute({
        userAddress: '0xabc...123',
        instruction: 'Show my wallet token balances'
      }, mockContext);

      expect(walletResult.status.state).toBe('completed');
      expect(walletResult.message).toContain('Balance Analysis');
    });

    it('should execute health monitoring skill workflow', async () => {
      const { monitorHealthTool } = await import('../../src/tools/monitorHealth.js');

      // Mock position data for monitoring
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: {
          positions: [{
            healthFactor: '1.3',
            totalCollateralUsd: '6000',
            totalBorrowsUsd: '4500',
            userReserves: [{
              underlyingBalance: '3000',
              variableBorrows: '2250',
              token: {
                symbol: 'WETH',
                tokenUid: { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' },
                decimals: 18
              }
            }]
          }]
        }
      });

      const monitoringResult = await monitorHealthTool.execute({
        userAddress: '0xdef...456',
        instruction: 'Start monitoring every 2 minutes and prevent liquidation automatically'
      }, mockContext);

      expect(monitoringResult.status.state).toBe('completed');
      expect(monitoringResult.message).toContain('Automatic liquidation prevention activated');
      expect(monitoringResult.message).toContain('Current HF: 1.3000');
      expect(monitoringResult.message).toContain('WARNING');
    });

    it('should execute liquidation prevention skill workflow', async () => {
      const { supplyCollateralTool } = await import('../../src/tools/supplyCollateral.js');
      const { repayDebtTool } = await import('../../src/tools/repayDebt.js');

      // Test supply collateral action
      const mockSupplyResponse = {
        structuredContent: {
          transactions: [{
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xsupplydata',
            value: '0',
            chainId: '42161'
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValueOnce({
        isError: false,
        structuredContent: mockSupplyResponse.structuredContent
      });

      const supplyResult = await supplyCollateralTool.execute({
        tokenSymbol: 'USDC',
        amount: '1000',
        userAddress: '0x111...222',
        instruction: 'Supply 1000 USDC as collateral to improve my health factor'
      }, mockContext);

      expect(supplyResult.status.state).toBe('completed');
      expect(supplyResult.message).toContain('Successfully supplied');

      // Test debt repayment action
      const mockRepayResponse = {
        structuredContent: {
          transactions: [{
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xrepaydata',
            value: '0',
            chainId: '42161'
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValueOnce({
        isError: false,
        structuredContent: mockRepayResponse.structuredContent
      });

      const repayResult = await repayDebtTool.execute({
        tokenSymbol: 'DAI',
        amount: '500',
        userAddress: '0x333...444',
        instruction: 'Repay 500 DAI debt to reduce liquidation risk'
      }, mockContext);

      expect(repayResult.status.state).toBe('completed');
      expect(repayResult.message).toContain('Successfully repaid');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle complete workflow failure gracefully', async () => {
      const { getUserPositionsTool } = await import('../../src/tools/getUserPositions.js');

      // Mock MCP client failure
      mockMcpClient.callTool.mockResolvedValue({
        isError: true,
        content: [{ text: 'Network error - unable to fetch positions' }]
      });

      const result = await getUserPositionsTool.execute({
        userAddress: '0xerror...test',
        instruction: 'Check my positions'
      }, mockContext);

      expect(result.status.state).toBe('failed');
      expect(result.error).toContain('positions');
    });

    it('should handle intelligent strategy with no recommendations', async () => {
      const { intelligentPreventionStrategyTool } = await import('../../src/tools/intelligentPreventionStrategy.js');

      // Mock LLM returning empty recommendations
      const { generateText } = vi.mocked(await import('ai'));
      generateText.mockResolvedValue({
        response: {
          messages: [{
            content: [{
              type: 'text',
              text: JSON.stringify({
                currentAnalysis: {
                  currentHF: '3.0',
                  targetHF: '1.5',
                  requiredIncrease: '0'
                },
                recommendedActions: [],
                // Missing optimalAction
              })
            }]
          }]
        }
      });

      // Mock position data
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: {
          positions: [{
            healthFactor: '3.0',
            totalCollateralUsd: '10000',
            totalBorrowsUsd: '3000'
          }]
        }
      });

      const result = await intelligentPreventionStrategyTool.execute({
        userAddress: '0xsafe...position',
        targetHealthFactor: 1.5
      }, mockContext);

      expect(result.status.state).toBe('failed');
      expect(result.error).toContain('Required');
    });

    it('should handle transaction execution failure', async () => {
      const { supplyCollateralTool } = await import('../../src/tools/supplyCollateral.js');

      // Mock successful MCP call but transaction execution failure
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: {
          transactions: [{
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xfailure',
            value: '0',
            chainId: '42161'
          }]
        }
      });

      mockExecuteTransaction.mockRejectedValue(new Error('Transaction failed: Insufficient funds'));

      await expect(supplyCollateralTool.execute({
        tokenSymbol: 'USDC',
        amount: '10000', // Too much
        userAddress: '0xpoor...wallet'
      }, mockContext)).rejects.toThrow('Insufficient funds');
    });
  });

  describe('Performance and Integration', () => {
    it('should handle multiple concurrent operations', async () => {
      const { getUserPositionsTool } = await import('../../src/tools/getUserPositions.js');
      const { getWalletBalancesTool } = await import('../../src/tools/getWalletBalances.js');

      // Mock successful responses for position calls with proper structure
      const mockPositionResponse = {
        isError: false,
        structuredContent: {
          positions: [{
            healthFactor: '1.8',
            totalCollateralUsd: '5000',
            totalBorrowsUsd: '2500',
            userReserves: [{
              underlyingBalance: '2000',
              variableBorrows: '1000',
              token: {
                symbol: 'USDC',
                tokenUid: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                decimals: 6
              }
            }]
          }]
        }
      };

      // Set up the mock to return the position response for all calls
      mockMcpClient.callTool.mockResolvedValue(mockPositionResponse);

      const { createPublicClient, formatUnits } = vi.mocked(await import('viem'));
      const mockPublicClient = vi.mocked(createPublicClient()).readContract;
      mockPublicClient.mockResolvedValue(BigInt('1000000000'));
      vi.mocked(formatUnits).mockReturnValue('1000');

      // Execute multiple operations concurrently
      const promises = [
        getUserPositionsTool.execute({ userAddress: '0x1...1', instruction: 'Check positions' }, mockContext),
        getUserPositionsTool.execute({ userAddress: '0x2...2', instruction: 'Check positions' }, mockContext),
        getWalletBalancesTool.execute({ userAddress: '0x3...3', instruction: 'Check balances' }, mockContext)
      ];

      const results = await Promise.all(promises);

      // All results should be completed
      results.forEach(result => {
        expect(result.status.state).toBe('completed');
      });

      expect(mockMcpClient.callTool).toHaveBeenCalledTimes(3); // 3 position calls (wallet balance tool uses viem directly)
    });

    it('should maintain state consistency across operations', async () => {
      const { monitorHealthTool, getMonitoringSession, stopAllMonitoringSessions } = await import('../../src/tools/monitorHealth.js');

      // Start multiple monitoring sessions
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: {
          positions: [{
            healthFactor: '1.6',
            totalCollateralUsd: '8000',
            totalBorrowsUsd: '4800'
          }]
        }
      });

      await monitorHealthTool.execute({
        userAddress: '0xuser1',
        intervalMinutes: 1
      }, mockContext);

      await monitorHealthTool.execute({
        userAddress: '0xuser2',
        intervalMinutes: 2
      }, mockContext);

      // Verify both sessions exist
      expect(getMonitoringSession('0xuser1')).toBeDefined();
      expect(getMonitoringSession('0xuser2')).toBeDefined();

      // Clean up all sessions
      const stoppedCount = stopAllMonitoringSessions();
      expect(stoppedCount).toBeGreaterThanOrEqual(2);

      // Verify sessions are cleaned up
      expect(getMonitoringSession('0xuser1')).toBeUndefined();
      expect(getMonitoringSession('0xuser2')).toBeUndefined();
    });
  });
});