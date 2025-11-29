import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserPositionsTool } from '../../src/tools/getUserPositions.js';

// Mock the ember-schemas import
vi.mock('ember-schemas', () => ({
  GetWalletLendingPositionsResponseSchema: {
    parse: vi.fn().mockImplementation((data) => data)
  }
}));

// Mock the arbitrum-vibekit-core imports
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

describe('getUserPositions Tool', () => {
  let mockMcpClient: any;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock console methods to avoid noise in test output
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });

    mockMcpClient = {
      callTool: vi.fn()
    };

    mockContext = {
      custom: {
        mcpClient: mockMcpClient,
        thresholds: {
          critical: 1.05,
          danger: 1.1,
          warning: 1.3
        }
      }
    };
  });

  it('should be defined and have correct properties', () => {
    expect(getUserPositionsTool).toBeDefined();
    expect(getUserPositionsTool.name).toBe('get-user-positions');
    expect(getUserPositionsTool.description).toBe('Fetch user lending positions and health factor from Aave via Ember MCP server');
    expect(getUserPositionsTool.parameters).toBeDefined();
    expect(typeof getUserPositionsTool.execute).toBe('function');
  });

  it('should successfully fetch and analyze positions with safe health factor', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '2.5',
          totalCollateralUsd: '10000',
          totalBorrowsUsd: '4000',
          userReserves: [
            {
              token: { symbol: 'USDC' },
              underlyingBalance: '10000',
              variableBorrows: '0'
            },
            {
              token: { symbol: 'ETH' },
              underlyingBalance: '0',
              variableBorrows: '2.5'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue(mockPositionsResponse);

    const args = { userAddress: '0x123...abc' };
    const result = await getUserPositionsTool.execute(args, mockContext);
    console.log("result........:", result);
    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: 'getWalletLendingPositions',
      arguments: {
        walletAddress: '0x123...abc'
      }
    });

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('🟢');
    expect(result.message).toContain('SAFE');
    expect(result.message).toContain('2.5000');
    expect(result.message).toContain('$10,000');
    expect(result.message).toContain('$4,000');
  });

  it('should correctly identify critical risk level for low health factor', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '1.02',
          totalCollateralUsd: '5000',
          totalBorrowsUsd: '4800',
          userReserves: [
            {
              token: { symbol: 'USDC' },
              underlyingBalance: '5000',
              variableBorrows: '0'
            },
            {
              token: { symbol: 'ETH' },
              underlyingBalance: '0',
              variableBorrows: '2.4'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue(mockPositionsResponse);

    const args = { userAddress: '0x456...def' };
    const result = await getUserPositionsTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('🔴');
    expect(result.message).toContain('CRITICAL');
    expect(result.message).toContain('1.0200');
  });

  it('should correctly identify danger risk level', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '1.08',
          totalCollateralUsd: '8000',
          totalBorrowsUsd: '7000',
          userReserves: [
            {
              token: { symbol: 'WETH' },
              underlyingBalance: '3',
              variableBorrows: '0'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue(mockPositionsResponse);

    const args = { userAddress: '0x789...ghi' };
    const result = await getUserPositionsTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('🟠');
    expect(result.message).toContain('DANGER');
    expect(result.message).toContain('1.0800');
  });

  it('should correctly identify warning risk level', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '1.25',
          totalCollateralUsd: '12000',
          totalBorrowsUsd: '9000',
          userReserves: [
            {
              token: { symbol: 'USDC' },
              underlyingBalance: '12000',
              variableBorrows: '0'
            },
            {
              token: { symbol: 'DAI' },
              underlyingBalance: '0',
              variableBorrows: '9000'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue(mockPositionsResponse);

    const args = { userAddress: '0xabc...123' };
    const result = await getUserPositionsTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('🟡');
    expect(result.message).toContain('WARNING');
    expect(result.message).toContain('1.2500');
  });

  it('should handle empty positions gracefully', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: []
      }
    };

    mockMcpClient.callTool.mockResolvedValue(mockPositionsResponse);

    const args = { userAddress: '0xdef...456' };
    const result = await getUserPositionsTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('0 positions found');
    expect(result.message).toContain('Health Factor: N/A');
    expect(result.message).toContain('SAFE');
  });

  it('should handle positions without health factor', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          totalCollateralUsd: '1000',
          totalBorrowsUsd: '0',
          userReserves: [
            {
              token: { symbol: 'USDC' },
              underlyingBalance: '1000',
              variableBorrows: '0'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue(mockPositionsResponse);

    const args = { userAddress: '0x999...888' };
    const result = await getUserPositionsTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Health Factor: N/A');
    expect(result.message).toContain('SAFE');
  });

  it('should handle MCP client errors gracefully', async () => {
    const errorMessage = 'Network connection failed';
    mockMcpClient.callTool.mockRejectedValue(new Error(errorMessage));

    const args = { userAddress: '0x111...222' };
    const result = await getUserPositionsTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toBe(errorMessage);
  });

  it('should handle invalid response structure', async () => {
    mockMcpClient.callTool.mockResolvedValue({
      structuredContent: null
    });

    const args = { userAddress: '0x333...444' };
    const result = await getUserPositionsTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('Cannot read properties of null');
  });

  it('should validate input parameters', () => {
    const schema = getUserPositionsTool.parameters;

    // Valid input
    const validInput = { userAddress: '0x1234567890123456789012345678901234567890' };
    expect(() => schema.parse(validInput)).not.toThrow();

    // Invalid input - missing userAddress
    expect(() => schema.parse({})).toThrow();

    // Invalid input - wrong type
    expect(() => schema.parse({ userAddress: 123 })).toThrow();
  });

  it('should display position details correctly for multiple reserves', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          healthFactor: '1.8',
          totalCollateralUsd: '15000',
          totalBorrowsUsd: '8000',
          userReserves: [
            {
              token: { symbol: 'USDC' },
              underlyingBalance: '10000',
              variableBorrows: '0'
            },
            {
              token: { symbol: 'WETH' },
              underlyingBalance: '2',
              variableBorrows: '0'
            },
            {
              token: { symbol: 'DAI' },
              underlyingBalance: '0',
              variableBorrows: '8000'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue(mockPositionsResponse);

    const args = { userAddress: '0x555...666' };
    const result = await getUserPositionsTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('USDC: Supplied: 10000, Borrowed: 0');
    expect(result.message).toContain('WETH: Supplied: 2, Borrowed: 0');
    expect(result.message).toContain('DAI: Supplied: 0, Borrowed: 8000');
    expect(result.message).toContain('**Active Positions:** 1');
  });
});