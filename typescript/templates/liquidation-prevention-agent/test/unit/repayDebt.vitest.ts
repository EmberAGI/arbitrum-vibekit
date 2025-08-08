import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repayDebtTool } from '../../src/tools/repayDebt.js';

// Mock schemas and dependencies
vi.mock('ember-schemas', () => ({
  RepayResponseSchema: {
    parse: vi.fn().mockImplementation((data) => data)
  },
  TransactionPlanSchema: {
    parse: vi.fn().mockImplementation((data) => data)
  }
}));

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
  parseMcpToolResponsePayload: vi.fn().mockImplementation((result, schema) => result.structuredContent)
}));

// Mock utility functions
vi.mock('../../src/utils/userPreferences.js', () => ({
  parseUserPreferences: vi.fn().mockReturnValue({
    targetHealthFactor: 1.5,
    intervalMinutes: 15
  })
}));

vi.mock('../../src/utils/tokenResolver.js', () => ({
  resolveTokenInfo: vi.fn().mockImplementation((tokenMap, symbol) => {
    const mockTokens: any = {
      'USDC': { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', chainId: '42161' },
      'DAI': { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', chainId: '42161' },
      'WETH': { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', chainId: '42161' }
    };
    if (mockTokens[symbol]) {
      return mockTokens[symbol];
    }
    throw new Error(`Token ${symbol} not found`);
  }),
  isTokenSymbol: vi.fn().mockReturnValue(true)
}));

describe('repayDebt Tool', () => {
  let mockMcpClient: any;
  let mockContext: any;
  let mockExecuteTransaction: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock console methods to avoid noise in test output
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });

    mockExecuteTransaction = vi.fn().mockResolvedValue('Debt repayment transaction executed successfully');

    mockMcpClient = {
      callTool: vi.fn()
    };

    mockContext = {
      custom: {
        mcpClient: mockMcpClient,
        executeTransaction: mockExecuteTransaction,
        tokenMap: {
          USDC: [{ address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', chainId: '42161' }],
          DAI: [{ address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', chainId: '42161' }]
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
      }
    };
  });

  it('should be defined and have correct properties', () => {
    expect(repayDebtTool).toBeDefined();
    expect(repayDebtTool.name).toBe('repay-debt');
    expect(repayDebtTool.description).toBeDefined();
    // expect(repayDebtTool.description).toContain('prevent liquidation');
    expect(repayDebtTool.parameters).toBeDefined();
    expect(typeof repayDebtTool.execute).toBe('function');
  });

  it('should successfully repay debt using token symbol', async () => {
    const mockRepayResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xrepay123456',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockRepayResponse.structuredContent
    });

    const args = {
      tokenSymbol: 'USDC',
      amount: '2000',
      userAddress: '0x123...abc',
      instruction: 'Repay USDC debt to prevent liquidation with moderate risk tolerance'
    };

    const result = await repayDebtTool.execute(args, mockContext);

    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: 'lendingRepay',
      arguments: {
        tokenUid: {
          chainId: '42161',
          address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
        },
        amount: '2000',
        walletAddress: '0x123...abc'
      }
    });

    expect(mockExecuteTransaction).toHaveBeenCalledWith('repay-debt', [
      {
        type: 'EVM_TX',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0xrepay123456',
        value: '0',
        chainId: '42161'
      }
    ]);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully repaid 2000 USDC');
    expect(result.message).toContain('prevent liquidation');
    expect(result.message).toContain('improve health factor');
  });

  it('should successfully repay debt using token address', async () => {
    const mockRepayResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xrepayabcdef',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockRepayResponse.structuredContent
    });

    const args = {
      tokenAddress: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
      amount: '1500',
      userAddress: '0x456...def',
      chainId: '42161',
      interestRateMode: '2' as const
    };

    const result = await repayDebtTool.execute(args, mockContext);

    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: 'lendingRepay',
      arguments: {
        tokenUid: {
          chainId: '42161',
          address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'
        },
        amount: '1500',
        walletAddress: '0x456...def'
      }
    });

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully repaid 1500');
  });

  it('should handle emergency debt repayment for critical health factor', async () => {
    const mockRepayResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xemergencyrepay',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockRepayResponse.structuredContent
    });

    const args = {
      tokenSymbol: 'DAI',
      amount: 'max',
      userAddress: '0x789...ghi',
      instruction: 'Emergency full debt repayment - health factor is critical, prevent liquidation immediately'
    };

    const result = await repayDebtTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully repaid max DAI');
    expect(result.message).toContain('prevent liquidation');
  });

  it('should handle partial debt repayment strategy', async () => {
    const mockRepayResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xpartialrepay',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockRepayResponse.structuredContent
    });

    const args = {
      tokenSymbol: 'WETH',
      amount: '0.5',
      userAddress: '0xabc...123',
      instruction: 'Partial repayment to improve health factor without depleting all assets'
    };

    const result = await repayDebtTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully repaid 0.5 WETH');
  });

  it('should handle missing MCP client error', async () => {
    const contextWithoutMcp = {
      custom: {
        mcpClient: null,
        executeTransaction: mockExecuteTransaction,
        tokenMap: mockContext.custom.tokenMap,
        thresholds: mockContext.custom.thresholds
      }
    };

    const args = {
      tokenSymbol: 'USDC',
      amount: '100',
      userAddress: '0x123...abc'
    };

    await expect(repayDebtTool.execute(args, contextWithoutMcp as any))
      .rejects.toThrow('Ember MCP client not found in context');
  });

  it('should handle token resolution errors', async () => {
    const { resolveTokenInfo } = await import('../../src/utils/tokenResolver.js');
    vi.mocked(resolveTokenInfo).mockImplementationOnce(() => {
      throw new Error('Token UNKNOWN not supported for debt repayment');
    });

    const args = {
      tokenSymbol: 'UNKNOWN',
      amount: '100',
      userAddress: '0x123...abc'
    };

    await expect(repayDebtTool.execute(args, mockContext))
      .rejects.toThrow('Token UNKNOWN not supported for debt repayment');
  });

  it('should handle MCP server errors during repayment', async () => {
    mockMcpClient.callTool.mockResolvedValue({
      isError: true,
      content: [{ text: 'Insufficient balance to repay debt' }]
    });

    const args = {
      tokenSymbol: 'USDC',
      amount: '10000',
      userAddress: '0x123...abc'
    };

    await expect(repayDebtTool.execute(args, mockContext))
      .rejects.toThrow('Failed to prepare repay transaction: Insufficient balance to repay debt');
  });

  it('should handle transaction execution failures', async () => {
    const mockRepayResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xrepay123456',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockRepayResponse.structuredContent
    });

    mockExecuteTransaction.mockRejectedValue(new Error('Transaction failed: Gas estimation failed'));

    const args = {
      tokenSymbol: 'USDC',
      amount: '1000',
      userAddress: '0x123...abc'
    };

    await expect(repayDebtTool.execute(args, mockContext))
      .rejects.toThrow('Failed to execute repay transaction: Transaction failed: Gas estimation failed');
  });

  it('should handle missing token parameters', async () => {
    const args = {
      amount: '100',
      userAddress: '0x123...abc'
    };

    await expect(repayDebtTool.execute(args as any, mockContext))
      .rejects.toThrow('Either tokenAddress or tokenSymbol must be provided');
  });

  it('should handle missing token map for symbol resolution', async () => {
    const contextWithoutTokenMap = {
      custom: {
        mcpClient: mockMcpClient,
        executeTransaction: mockExecuteTransaction,
        tokenMap: null,
        thresholds: mockContext.custom.thresholds
      }
    };

    const args = {
      tokenSymbol: 'USDC',
      amount: '100',
      userAddress: '0x123...abc'
    };

    await expect(repayDebtTool.execute(args, contextWithoutTokenMap as any))
      .rejects.toThrow('Token map not available. Cannot resolve token symbol.');
  });

  it('should validate input parameters correctly', () => {
    const schema = repayDebtTool.parameters;

    // Valid input with token symbol
    const validSymbolInput = {
      tokenSymbol: 'USDC',
      amount: '1000',
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    expect(() => schema.parse(validSymbolInput)).not.toThrow();

    // Valid input with token address
    const validAddressInput = {
      tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      amount: '500',
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    expect(() => schema.parse(validAddressInput)).not.toThrow();

    // Valid input with max amount
    const validMaxInput = {
      tokenSymbol: 'DAI',
      amount: 'max',
      userAddress: '0x1234567890123456789012345678901234567890'
    };
    expect(() => schema.parse(validMaxInput)).not.toThrow();

    // Valid input with interest rate mode
    const validWithRateMode = {
      tokenSymbol: 'USDC',
      amount: '1000',
      userAddress: '0x1234567890123456789012345678901234567890',
      interestRateMode: '1' as const
    };
    expect(() => schema.parse(validWithRateMode)).not.toThrow();

    // Invalid input - missing both token identifiers
    expect(() => schema.parse({
      amount: '100',
      userAddress: '0x1234567890123456789012345678901234567890'
    })).toThrow();

    // Invalid input - missing amount
    expect(() => schema.parse({
      tokenSymbol: 'USDC',
      userAddress: '0x1234567890123456789012345678901234567890'
    })).toThrow();

    // Invalid input - missing userAddress
    expect(() => schema.parse({
      tokenSymbol: 'USDC',
      amount: '100'
    })).toThrow();

    // Invalid input - invalid interest rate mode
    expect(() => schema.parse({
      tokenSymbol: 'USDC',
      amount: '100',
      userAddress: '0x1234567890123456789012345678901234567890',
      interestRateMode: '3'
    })).toThrow();
  });

  it('should handle multi-step debt repayment with approval', async () => {
    const mockRepayResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x2222222222222222222222222222222222222222',
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

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockRepayResponse.structuredContent
    });

    const args = {
      tokenSymbol: 'DAI',
      amount: '3000',
      userAddress: '0xdef...456',
      instruction: 'Large debt repayment to significantly improve health factor'
    };

    const result = await repayDebtTool.execute(args, mockContext);

    expect(mockExecuteTransaction).toHaveBeenCalledWith('repay-debt', [
      {
        type: 'EVM_TX',
        to: '0x2222222222222222222222222222222222222222',
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

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully repaid 3000 DAI');
  });

  it('should handle stable rate debt repayment', async () => {
    const mockRepayResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xstablerepay',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockRepayResponse.structuredContent
    });

    const args = {
      tokenSymbol: 'USDC',
      amount: '800',
      userAddress: '0x555...666',
      interestRateMode: '1' as const,
      instruction: 'Repay stable rate debt to reduce interest burden'
    };

    const result = await repayDebtTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully repaid 800 USDC');
  });
});