import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supplyCollateralTool } from '../../src/tools/supplyCollateral.js';

// Mock schemas and dependencies
vi.mock('ember-schemas', () => ({
  SupplyResponseSchema: {
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

describe('supplyCollateral Tool', () => {
  let mockMcpClient: any;
  let mockContext: any;
  let mockExecuteTransaction: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock console methods to avoid noise in test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockExecuteTransaction = vi.fn().mockResolvedValue('Transaction executed successfully');

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
    expect(supplyCollateralTool).toBeDefined();
    expect(supplyCollateralTool.name).toBe('supply-collateral');
    expect(supplyCollateralTool.description).toContain('improve health factor');
    expect(supplyCollateralTool.description).toContain('prevent liquidation');
    expect(supplyCollateralTool.parameters).toBeDefined();
    expect(typeof supplyCollateralTool.execute).toBe('function');
  });

  it('should successfully supply collateral using token symbol', async () => {
    const mockSupplyResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0x1234567890',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockSupplyResponse.structuredContent
    });

    const args = {
      tokenSymbol: 'USDC',
      amount: '1000',
      userAddress: '0x123...abc',
      instruction: 'Supply USDC to prevent liquidation with moderate risk tolerance'
    };

    const result = await supplyCollateralTool.execute(args, mockContext);

    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: 'lendingSupply',
      arguments: {
        tokenUid: {
          chainId: '42161',
          address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
        },
        amount: '1000',
        walletAddress: '0x123...abc'
      }
    });

    expect(mockExecuteTransaction).toHaveBeenCalledWith('supply-collateral', [
      {
        type: 'EVM_TX',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0x1234567890',
        value: '0',
        chainId: '42161'
      }
    ]);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully supplied 1000 USDC');
    expect(result.message).toContain('prevent liquidation');
    expect(result.message).toContain('improve health factor');
  });

  it('should successfully supply collateral using token address', async () => {
    const mockSupplyResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xabcdef123',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockSupplyResponse.structuredContent
    });

    const args = {
      tokenAddress: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
      amount: '500',
      userAddress: '0x456...def',
      chainId: '42161'
    };

    const result = await supplyCollateralTool.execute(args, mockContext);

    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: 'lendingSupply',
      arguments: {
        tokenUid: {
          chainId: '42161',
          address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'
        },
        amount: '500',
        walletAddress: '0x456...def'
      }
    });

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully supplied 500');
  });

  it('should handle liquidation prevention with emergency supply', async () => {
    const mockSupplyResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xemergency123',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockSupplyResponse.structuredContent
    });

    const args = {
      tokenSymbol: 'WETH',
      amount: '2.5',
      userAddress: '0x789...ghi',
      instruction: 'Emergency supply to prevent liquidation - health factor critical'
    };

    const result = await supplyCollateralTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully supplied 2.5 WETH');
    expect(result.message).toContain('prevent liquidation');
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

    await expect(supplyCollateralTool.execute(args, contextWithoutMcp as any))
      .rejects.toThrow('Ember MCP client not found in context');
  });

  it('should handle token resolution errors', async () => {
    const { resolveTokenInfo } = await import('../../src/utils/tokenResolver.js');
    vi.mocked(resolveTokenInfo).mockImplementationOnce(() => {
      throw new Error('Token UNKNOWN not supported');
    });

    const args = {
      tokenSymbol: 'UNKNOWN',
      amount: '100',
      userAddress: '0x123...abc'
    };

    await expect(supplyCollateralTool.execute(args, mockContext))
      .rejects.toThrow('Token UNKNOWN not supported');
  });

  it('should handle MCP server errors', async () => {
    mockMcpClient.callTool.mockResolvedValue({
      isError: true,
      content: [{ text: 'Insufficient allowance for token transfer' }]
    });

    const args = {
      tokenSymbol: 'USDC',
      amount: '1000',
      userAddress: '0x123...abc'
    };

    await expect(supplyCollateralTool.execute(args, mockContext))
      .rejects.toThrow('Failed to prepare supply transaction: Insufficient allowance for token transfer');
  });

  it('should handle transaction execution failures', async () => {
    const mockSupplyResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0x1234567890',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockSupplyResponse.structuredContent
    });

    mockExecuteTransaction.mockRejectedValue(new Error('Transaction reverted'));

    const args = {
      tokenSymbol: 'USDC',
      amount: '1000',
      userAddress: '0x123...abc'
    };

    await expect(supplyCollateralTool.execute(args, mockContext))
      .rejects.toThrow('Failed to execute supply transaction: Transaction reverted');
  });

  it('should handle missing token parameters', async () => {
    const args = {
      amount: '100',
      userAddress: '0x123...abc'
    };

    await expect(supplyCollateralTool.execute(args as any, mockContext))
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

    await expect(supplyCollateralTool.execute(args, contextWithoutTokenMap as any))
      .rejects.toThrow('Token map not available. Cannot resolve token symbol.');
  });

  it('should validate input parameters correctly', () => {
    const schema = supplyCollateralTool.parameters;
    
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
  });

  it('should handle multiple transaction execution for complex supply operations', async () => {
    const mockSupplyResponse = {
      structuredContent: {
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x1111111111111111111111111111111111111111',
            data: '0xapprove123',
            value: '0',
            chainId: '42161'
          },
          {
            type: 'EVM_TX',
            to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
            data: '0xsupply456',
            value: '0',
            chainId: '42161'
          }
        ]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockSupplyResponse.structuredContent
    });

    const args = {
      tokenSymbol: 'DAI',
      amount: '5000',
      userAddress: '0xabc...123',
      instruction: 'Supply large amount to significantly improve health factor'
    };

    const result = await supplyCollateralTool.execute(args, mockContext);

    expect(mockExecuteTransaction).toHaveBeenCalledWith('supply-collateral', [
      {
        type: 'EVM_TX',
        to: '0x1111111111111111111111111111111111111111',
        data: '0xapprove123',
        value: '0',
        chainId: '42161'
      },
      {
        type: 'EVM_TX',
        to: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
        data: '0xsupply456',
        value: '0',
        chainId: '42161'
      }
    ]);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Successfully supplied 5000 DAI');
  });
});