import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWalletBalancesTool } from '../../src/tools/getWalletBalances.js';

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

// Mock viem
vi.mock('viem', () => ({
  createPublicClient: vi.fn().mockReturnValue({
    readContract: vi.fn()
  }),
  http: vi.fn(),
  formatUnits: vi.fn().mockImplementation((value, decimals) => {
    // Simple mock implementation
    const divisor = Math.pow(10, decimals);
    return (Number(value) / divisor).toString();
  }),
  arbitrum: {}
}));

vi.mock('viem/chains', () => ({
  arbitrum: {}
}));

// Mock fetch for CoinGecko API
global.fetch = vi.fn();

describe('getWalletBalances Tool', () => {
  let mockMcpClient: any;
  let mockContext: any;
  let mockPublicClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock console methods to avoid noise in test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockPublicClient = {
      readContract: vi.fn()
    };

    const { createPublicClient } = await import('viem');
    vi.mocked(createPublicClient).mockReturnValue(mockPublicClient);

    mockMcpClient = {
      callTool: vi.fn()
    };

    mockContext = {
      custom: {
        mcpClient: mockMcpClient,
        quicknode: {
          subdomain: 'test-subdomain',
          apiKey: 'test-api-key'
        }
      }
    };

    // Mock fetch for CoinGecko API
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { usd: 1.0 }, // USDC
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { usd: 3000.0 } // WETH
      })
    } as Response);
  });

  it('should be defined and have correct properties', () => {
    expect(getWalletBalancesTool).toBeDefined();
    expect(getWalletBalancesTool.name).toBe('get-wallet-balances');
    expect(getWalletBalancesTool.description).toContain('wallet token balances');
    expect(getWalletBalancesTool.parameters).toBeDefined();
    expect(typeof getWalletBalancesTool.execute).toBe('function');
  });

  it('should handle wallet with no lending positions', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: []
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    const args = { walletAddress: '0x123...abc' };
    const result = await getWalletBalancesTool.execute(args, mockContext);

    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: 'getWalletLendingPositions',
      arguments: {
        walletAddress: '0x123...abc'
      }
    });

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('No lending positions found');
  });

  it('should successfully fetch balances for wallet with active positions', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          userReserves: [
            {
              token: {
                symbol: 'USDC',
                decimals: 6,
                tokenUid: {
                  address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
                  chainId: '42161'
                }
              },
              underlyingBalance: '1000',
              variableBorrows: '0'
            },
            {
              token: {
                symbol: 'WETH',
                decimals: 18,
                tokenUid: {
                  address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
                  chainId: '42161'
                }
              },
              underlyingBalance: '0',
              variableBorrows: '0.5'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    // Mock contract calls for token balances
    mockPublicClient.readContract
      .mockResolvedValueOnce(BigInt('5000000000')) // 5000 USDC (6 decimals)
      .mockResolvedValueOnce(BigInt('2000000000000000000')); // 2 WETH (18 decimals)

    const args = { walletAddress: '0x456...def' };
    const result = await getWalletBalancesTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Balance Analysis');
    expect(result.message).toContain('USDC');
    expect(result.message).toContain('WETH');
    expect(result.message).toContain('liquidation prevention strategies');
  });

  it('should handle positions with only supplied tokens', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          userReserves: [
            {
              token: {
                symbol: 'USDC',
                decimals: 6,
                tokenUid: {
                  address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
                  chainId: '42161'
                }
              },
              underlyingBalance: '2000',
              variableBorrows: '0'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    mockPublicClient.readContract.mockResolvedValue(BigInt('3000000000')); // 3000 USDC

    const args = { walletAddress: '0x789...ghi' };
    const result = await getWalletBalancesTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Supply collateral');
    expect(result.message).toContain('USDC: 3000');
  });

  it('should handle positions with only borrowed tokens', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          userReserves: [
            {
              token: {
                symbol: 'DAI',
                decimals: 18,
                tokenUid: {
                  address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
                  chainId: '42161'
                }
              },
              underlyingBalance: '0',
              variableBorrows: '1500'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    // Mock DAI price not available, should use fallback
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { usd: 1.0 }
      })
    } as Response);

    mockPublicClient.readContract.mockResolvedValue(BigInt('500000000000000000000')); // 500 DAI

    const args = { walletAddress: '0xabc...123' };
    const result = await getWalletBalancesTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Direct debt repayment');
    expect(result.message).toContain('DAI');
  });

  it('should handle stablecoin price fallback when CoinGecko fails', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          userReserves: [
            {
              token: {
                symbol: 'USDT',
                decimals: 6,
                tokenUid: {
                  address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
                  chainId: '42161'
                }
              },
              underlyingBalance: '1000',
              variableBorrows: '0'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    // Mock CoinGecko API failure
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests'
    } as Response);

    mockPublicClient.readContract.mockResolvedValue(BigInt('2000000000')); // 2000 USDT

    const args = { walletAddress: '0xdef...456' };
    const result = await getWalletBalancesTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('USDT');
    expect(result.message).toContain('$2,000'); // Should use fallback price of $1 for stablecoin
  });

  it('should handle contract call failures gracefully', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          userReserves: [
            {
              token: {
                symbol: 'WBTC',
                decimals: 8,
                tokenUid: {
                  address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
                  chainId: '42161'
                }
              },
              underlyingBalance: '1',
              variableBorrows: '0'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    // Mock contract call failure
    mockPublicClient.readContract.mockRejectedValue(new Error('Contract call failed'));

    const args = { walletAddress: '0x999...888' };
    const result = await getWalletBalancesTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    // Should still complete successfully but with fewer tokens
  });

  it('should handle MCP client errors', async () => {
    mockMcpClient.callTool.mockResolvedValue({
      isError: true
    });

    const args = { walletAddress: '0x111...222' };
    const result = await getWalletBalancesTool.execute(args, mockContext);

    expect(result.status.state).toBe('failed');
    expect(result.error).toContain('Failed to fetch user positions');
  });

  it('should handle unsupported chain ID', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          userReserves: [
            {
              token: {
                symbol: 'USDC',
                decimals: 6,
                tokenUid: {
                  address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
                  chainId: '1' // Ethereum mainnet - unsupported
                }
              },
              underlyingBalance: '1000',
              variableBorrows: '0'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    const args = { walletAddress: '0x333...444' };
    const result = await getWalletBalancesTool.execute(args, mockContext);

    // Should still complete but skip unsupported chain tokens
    expect(result.status.state).toBe('completed');
  });

  it('should validate input parameters', () => {
    const schema = getWalletBalancesTool.parameters;
    
    // Valid input
    const validInput = { walletAddress: '0x1234567890123456789012345678901234567890' };
    expect(() => schema.parse(validInput)).not.toThrow();

    // Invalid input - missing walletAddress
    expect(() => schema.parse({})).toThrow();
    
    // Invalid input - wrong type
    expect(() => schema.parse({ walletAddress: 123 })).toThrow();
  });

  it('should generate appropriate liquidation prevention strategies', async () => {
    const mockPositionsResponse = {
      structuredContent: {
        positions: [{
          userReserves: [
            {
              token: {
                symbol: 'USDC',
                decimals: 6,
                tokenUid: {
                  address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
                  chainId: '42161'
                }
              },
              underlyingBalance: '1000',
              variableBorrows: '0'
            },
            {
              token: {
                symbol: 'ETH',
                decimals: 18,
                tokenUid: {
                  address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
                  chainId: '42161'
                }
              },
              underlyingBalance: '0',
              variableBorrows: '1'
            }
          ]
        }]
      }
    };

    mockMcpClient.callTool.mockResolvedValue({
      isError: false,
      structuredContent: mockPositionsResponse.structuredContent
    });

    mockPublicClient.readContract
      .mockResolvedValueOnce(BigInt('5000000000')) // 5000 USDC
      .mockResolvedValueOnce(BigInt('1000000000000000000')); // 1 ETH

    const args = { walletAddress: '0x555...666' };
    const result = await getWalletBalancesTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    expect(result.message).toContain('Supply collateral');
    expect(result.message).toContain('Repay debt');
    expect(result.message).toContain('strategies available');
  });
});