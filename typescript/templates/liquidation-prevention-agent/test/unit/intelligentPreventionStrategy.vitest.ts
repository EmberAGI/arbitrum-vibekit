import { describe, it, expect, vi, beforeEach } from 'vitest';
import { intelligentPreventionStrategyTool } from '../../src/tools/intelligentPreventionStrategy.js';

// Mock dependencies
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
  getAvailableProviders: vi.fn().mockReturnValue(['openrouter']),
  createProviderSelector: vi.fn().mockReturnValue({
    openrouter: vi.fn().mockReturnValue({
      modelId: 'test-model',
      provider: 'openrouter'
    })
  })
}));

// Mock AI library
vi.mock('ai', () => ({
  generateText: vi.fn()
}));

// Mock utility functions
vi.mock('../../src/utils/userPreferences.js', () => ({
  parseUserPreferences: vi.fn().mockReturnValue({
    targetHealthFactor: 1.5,
    riskTolerance: 'moderate'
  }),
  mergePreferencesWithDefaults: vi.fn().mockReturnValue({
    targetHealthFactor: 1.5,
    riskTolerance: 'moderate'
  }),
  generatePreferencesSummary: vi.fn().mockReturnValue('Target Health Factor: 1.5, Risk Tolerance: moderate')
}));

vi.mock('../../src/utils/liquidationData.js', () => ({
  generateLiquidationPreventionData: vi.fn()
}));

// Mock tool imports
vi.mock('../../src/tools/supplyCollateral.js', () => ({
  supplyCollateralTool: {
    execute: vi.fn().mockResolvedValue({
      isError: false,
      status: { state: 'completed' },
      message: 'Collateral supplied successfully'
    })
  }
}));

vi.mock('../../src/tools/repayDebt.js', () => ({
  repayDebtTool: {
    execute: vi.fn().mockResolvedValue({
      isError: false,
      status: { state: 'completed' },
      message: 'Debt repaid successfully'
    })
  }
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn()
  }
}));

describe('intelligentPreventionStrategy Tool', () => {
  let mockContext: any;
  let mockGenerateText: any;
  let mockGenerateLiquidationData: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock console methods to avoid noise in test output
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
    vi.spyOn(console, 'warn').mockImplementation(() => { });

    // Mock environment variables
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';

    const { generateText } = await import('ai');
    mockGenerateText = vi.mocked(generateText);

    const { generateLiquidationPreventionData } = await import('../../src/utils/liquidationData.js');
    mockGenerateLiquidationData = vi.mocked(generateLiquidationPreventionData);

    mockContext = {
      custom: {
        thresholds: {
          warning: 1.5,
          danger: 1.2,
          critical: 1.05
        },
        monitoring: {
          enabled: true,
          interval: 300
        },
        strategy: {
          autoPrevent: true,
          targetHealthFactor: 1.5
        }
      }
    };

    // Default mock for liquidation data
    mockGenerateLiquidationData.mockResolvedValue({
      positionSummary: {
        currentHealthFactor: '1.02',
        totalSuppliedUsd: 10000,
        totalBorrowedUsd: 9500,
        liquidationThreshold: 0.85
      },
      walletBalances: [
        {
          tokenSymbol: 'USDC',
          balance: '5000',
          balanceUsd: 5000,
          canSupply: true,
          canRepay: true
        }
      ],
      recommendations: {
        supplyOptions: ['USDC'],
        repayOptions: ['DAI'],
        urgencyLevel: 'CRITICAL'
      }
    });

    // Default mock for LLM response
    mockGenerateText.mockResolvedValue({
      response: {
        messages: [{
          content: [{
            type: 'text',
            text: JSON.stringify({
              currentAnalysis: {
                currentHF: '1.02',
                targetHF: '1.5',
                requiredIncrease: '0.48'
              },
              recommendedActions: [
                {
                  actionType: 'SUPPLY',
                  asset: 'USDC',
                  amountUsd: '2000',
                  amountToken: '2000',
                  expectedHealthFactor: '1.6',
                  priority: 1
                }
              ],
              optimalAction: {
                actionType: 'SUPPLY',
                asset: 'USDC',
                amountUsd: '2000',
                amountToken: '2000',
                expectedHealthFactor: '1.6',
                priority: 1
              }
            })
          }]
        }]
      }
    });
  });

  it('should be defined and have correct properties', () => {
    expect(intelligentPreventionStrategyTool).toBeDefined();
    expect(intelligentPreventionStrategyTool.name).toBe('intelligent-prevention-strategy');
    expect(intelligentPreventionStrategyTool.description).toBeDefined();
    // expect(intelligentPreventionStrategyTool.description).toContain('optimal liquidation prevention strategy');
    expect(intelligentPreventionStrategyTool.parameters).toBeDefined();
    expect(typeof intelligentPreventionStrategyTool.execute).toBe('function');
  });

  it('should analyze and recommend supply collateral strategy', async () => {
    const args = {
      userAddress: '0x123...abc',
      targetHealthFactor: 1.5,
      instruction: 'Emergency liquidation prevention needed'
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(mockGenerateLiquidationData).toHaveBeenCalledWith(
      '0x123...abc',
      mockContext.custom,
      '1.5'
    );

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(Object),
        prompt: expect.stringContaining('You are a backend assistant'),
        temperature: 0.7,
        maxTokens: 4000
      })
    );

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Intelligent Prevention Strategy Analysis');
    expect(result.message).toContain('SUPPLY 2000 USDC');
    expect(result.message).toContain('**Expected HF After Action:** 1.6');
  });

  it('should analyze and recommend debt repayment strategy', async () => {
    mockGenerateText.mockResolvedValue({
      response: {
        messages: [{
          content: [{
            type: 'text',
            text: JSON.stringify({
              currentAnalysis: {
                currentHF: '1.08',
                targetHF: '1.3',
                requiredIncrease: '0.22'
              },
              recommendedActions: [
                {
                  actionType: 'REPAY',
                  asset: 'DAI',
                  amountUsd: '1500',
                  amountToken: '1500',
                  expectedHealthFactor: '1.4',
                  priority: 1
                }
              ],
              optimalAction: {
                actionType: 'REPAY',
                asset: 'DAI',
                amountUsd: '1500',
                amountToken: '1500',
                expectedHealthFactor: '1.4',
                priority: 1
              }
            })
          }]
        }]
      }
    });

    const args = {
      userAddress: '0x456...def',
      targetHealthFactor: 1.3,
      instruction: 'Prefer debt repayment over supply'
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('REPAY 1500 DAI');
    expect(result.message).toContain('**Expected HF After Action:** 1.4');
  });

  it('should analyze and recommend hybrid strategy', async () => {
    mockGenerateText.mockResolvedValue({
      response: {
        messages: [{
          content: [{
            type: 'text',
            text: JSON.stringify({
              currentAnalysis: {
                currentHF: '1.01',
                targetHF: '1.6',
                requiredIncrease: '0.59'
              },
              recommendedActions: [
                {
                  actionType: 'HYBRID',
                  asset: 'USDC+DAI',
                  amountUsd: '3000',
                  amountToken: '1500+1500',
                  expectedHealthFactor: '1.7',
                  priority: 1,
                  steps: [
                    {
                      actionType: 'SUPPLY',
                      asset: 'USDC',
                      amountUsd: '1500',
                      amountToken: '1500',
                      expectedHealthFactor: '1.5',
                      priority: 1
                    },
                    {
                      actionType: 'REPAY',
                      asset: 'DAI',
                      amountUsd: '1500',
                      amountToken: '1500',
                      expectedHealthFactor: '1.7',
                      priority: 2
                    }
                  ]
                }
              ],
              optimalAction: {
                actionType: 'HYBRID',
                asset: 'USDC+DAI',
                amountUsd: '3000',
                amountToken: '1500+1500',
                expectedHealthFactor: '1.7',
                priority: 1,
                steps: [
                  {
                    actionType: 'SUPPLY',
                    asset: 'USDC',
                    amountUsd: '1500',
                    amountToken: '1500',
                    expectedHealthFactor: '1.5',
                    priority: 1
                  },
                  {
                    actionType: 'REPAY',
                    asset: 'DAI',
                    amountUsd: '1500',
                    amountToken: '1500',
                    expectedHealthFactor: '1.7',
                    priority: 2
                  }
                ]
              }
            })
          }]
        }]
      }
    });

    const args = {
      userAddress: '0x789...ghi',
      targetHealthFactor: 1.6,
      instruction: 'Critical situation - use all available options'
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('HYBRID 1500+1500 USDC+DAI');
    expect(result.message).toContain('**Expected HF After Action:** 1.7');
  });

  it('should handle default target health factor', async () => {
    // Mock parseUserPreferences to return empty preferences for default behavior
    const { parseUserPreferences } = await import('../../src/utils/userPreferences.js');
    vi.mocked(parseUserPreferences).mockReturnValueOnce({});

    const args = {
      userAddress: '0xabc...123'
      // targetHealthFactor not specified - should default to 1.03
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(mockGenerateLiquidationData).toHaveBeenCalledWith(
      '0xabc...123',
      mockContext.custom,
      '1.03'
    );

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('**Target Health Factor:** 1.03');
  });

  it('should handle user preference override for target health factor', async () => {
    const { parseUserPreferences } = await import('../../src/utils/userPreferences.js');
    vi.mocked(parseUserPreferences).mockReturnValueOnce({
      targetHealthFactor: 2.0,
      riskTolerance: 'conservative'
    });

    const args = {
      userAddress: '0xdef...456',
      targetHealthFactor: 1.5, // This should be overridden by user preferences
      instruction: 'Conservative approach - maintain high health factor'
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(mockGenerateLiquidationData).toHaveBeenCalledWith(
      '0xdef...456',
      mockContext.custom,
      '2'
    );

    expect(result.status.state).toBe('completed');
  });

  it('should handle liquidation data generation errors', async () => {
    mockGenerateLiquidationData.mockRejectedValue(new Error('Failed to fetch position data'));

    const args = {
      userAddress: '0x111...222',
      targetHealthFactor: 1.3
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('Failed to fetch position data');
  });

  it('should handle LLM API errors', async () => {
    mockGenerateText.mockRejectedValue(new Error('LLM API timeout'));

    const args = {
      userAddress: '0x333...444',
      targetHealthFactor: 1.4
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('LLM API timeout');
  });

  it('should handle invalid LLM response format', async () => {
    mockGenerateText.mockResolvedValue({
      response: {
        messages: [{
          content: [{
            type: 'text',
            text: 'Invalid JSON response from LLM'
          }]
        }]
      }
    });

    const args = {
      userAddress: '0x555...666',
      targetHealthFactor: 1.2
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('is not valid JSON');
  });

  it('should handle missing LLM content', async () => {
    mockGenerateText.mockResolvedValue({
      response: {
        messages: [{
          content: []
        }]
      }
    });

    const args = {
      userAddress: '0x777...888',
      targetHealthFactor: 1.3
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('LLM content array does not contain a valid text entry');
  });

  it('should handle missing optimal action in LLM response', async () => {
    mockGenerateText.mockResolvedValue({
      response: {
        messages: [{
          content: [{
            type: 'text',
            text: JSON.stringify({
              currentAnalysis: {
                currentHF: '1.02',
                targetHF: '1.5',
                requiredIncrease: '0.48'
              },
              recommendedActions: [],
              // Missing optimalAction
            })
          }]
        }]
      }
    });

    const args = {
      userAddress: '0x999...000',
      targetHealthFactor: 1.5
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('Required');
  });

  it('should validate input parameters correctly', () => {
    const schema = intelligentPreventionStrategyTool.parameters;

    // Valid input with defaults
    const validInput = {
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    expect(() => schema.parse(validInput)).not.toThrow();

    // Valid input with custom parameters
    const validCustomInput = {
      userAddress: '0x1234567890123456789012345678901234567890',
      targetHealthFactor: 1.8,
      instruction: 'Conservative liquidation prevention',
      chainId: '1'
    };
    expect(() => schema.parse(validCustomInput)).not.toThrow();

    // Invalid input - missing userAddress
    expect(() => schema.parse({
      targetHealthFactor: 1.5
    })).toThrow();

    // Invalid input - wrong type for targetHealthFactor
    expect(() => schema.parse({
      userAddress: '0x1234567890123456789012345678901234567890',
      targetHealthFactor: 'invalid'
    })).toThrow();
  });

  it('should handle reasoning type content from LLM', async () => {
    mockGenerateText.mockResolvedValue({
      response: {
        messages: [{
          content: [{
            type: 'text',
            text: JSON.stringify({
              currentAnalysis: {
                currentHF: '1.05',
                targetHF: '1.4',
                requiredIncrease: '0.35'
              },
              recommendedActions: [
                {
                  actionType: 'SUPPLY',
                  asset: 'WETH',
                  amountUsd: '1000',
                  amountToken: '0.4',
                  expectedHealthFactor: '1.45',
                  priority: 1
                }
              ],
              optimalAction: {
                actionType: 'SUPPLY',
                asset: 'WETH',
                amountUsd: '1000',
                amountToken: '0.4',
                expectedHealthFactor: '1.45',
                priority: 1
              }
            })
          }]
        }]
      }
    });

    const args = {
      userAddress: '0xbbb...ccc',
      targetHealthFactor: 1.4
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('SUPPLY 0.4 WETH');
  });

  it('should include comprehensive analysis in response message', async () => {
    mockGenerateLiquidationData.mockResolvedValue({
      positionSummary: {
        currentHealthFactor: '1.08',
        totalSuppliedUsd: 15000,
        totalBorrowedUsd: 12000,
        liquidationThreshold: 0.85
      },
      walletBalances: [
        {
          tokenSymbol: 'USDC',
          balance: '3000',
          balanceUsd: 3000,
          canSupply: true,
          canRepay: false
        }
      ],
      recommendations: {
        supplyOptions: ['USDC', 'WETH'],
        repayOptions: ['DAI'],
        urgencyLevel: 'HIGH'
      }
    });

    const args = {
      userAddress: '0xddd...eee',
      targetHealthFactor: 1.6,
      instruction: 'Detailed analysis needed for large position'
    };

    const result = await intelligentPreventionStrategyTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Intelligent Prevention Strategy Analysis');
    expect(result.message).toContain('**User:** 0xddd...eee');
    expect(result.message).toContain('**Current Health Factor:** 1.08');
    expect(result.message).toContain('**Target Health Factor:** 1.5');
    expect(result.message).toContain('LLM Recommended Optimal Action');
    expect(result.message).toContain('Expected HF After Action');
    expect(result.message).toContain('**Action Executed:** Successfully executed');
  });
});