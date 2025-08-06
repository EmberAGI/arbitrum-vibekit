import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAssetLiquidationThreshold, getPositionAssets, getWalletAssets, generateLiquidationPreventionData } from '../../src/utils/liquidationData.js';

// Mock viem modules
vi.mock('viem', () => ({
  createPublicClient: vi.fn().mockReturnValue({
    readContract: vi.fn()
  }),
  http: vi.fn(),
  formatUnits: vi.fn().mockReturnValue('1000'),
  arbitrum: {},
}));

// Mock arbitrum-vibekit-core
vi.mock('arbitrum-vibekit-core', () => ({
  parseMcpToolResponsePayload: vi.fn().mockImplementation((result, schema) => result.structuredContent)
}));

// Mock ember-schemas
vi.mock('ember-schemas', () => ({
  GetWalletLendingPositionsResponseSchema: {
    parse: vi.fn().mockImplementation((data) => data)
  }
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Liquidation Data Utilities', () => {
  let mockContext: any;
  let mockMcpClient: any;
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

    // Setup viem mocks
    const { createPublicClient } = await import('viem');
    vi.mocked(createPublicClient).mockReturnValue(mockPublicClient);

    mockMcpClient = {
      callTool: vi.fn()
    };

    mockContext = {
      quicknode: {
        subdomain: 'test-subdomain',
        apiKey: 'test-api-key'
      },
      mcpClient: mockMcpClient,
      thresholds: {
        warning: 1.5,
        danger: 1.2,
        critical: 1.05
      }
    };

    // Setup default fetch mock for CoinGecko API
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { usd: 1.0 }, // USDC
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { usd: 1.0 }  // DAI
      })
    });
  });

  describe('getAssetLiquidationThreshold', () => {
    it('should fetch liquidation threshold from Aave Protocol Data Provider', async () => {
      const mockLiquidationThreshold = BigInt(8400); // 84% in basis points
      mockPublicClient.readContract.mockResolvedValue([
        BigInt(0), BigInt(0), mockLiquidationThreshold, BigInt(0), BigInt(0),
        false, false, false, false, false
      ]);

      const result = await getAssetLiquidationThreshold(
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        mockContext
      );

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
        abi: expect.any(Array),
        functionName: 'getReserveConfigurationData',
        args: ['0xaf88d065e77c8cc2239327c5edb3a432268e5831']
      });

      expect(result).toBe('0.84'); // 8400 basis points = 0.84
    });

    it('should handle contract call errors and return default', async () => {
      mockPublicClient.readContract.mockRejectedValue(new Error('Contract call failed'));

      const result = await getAssetLiquidationThreshold(
        '0xinvalid',
        mockContext
      );

      expect(result).toBe('0');
    });

    it('should convert basis points to percentage correctly', async () => {
      const testCases = [
        { basisPoints: BigInt(8000), expected: '0.8' },   // 80%
        { basisPoints: BigInt(7500), expected: '0.75' },  // 75%  
        { basisPoints: BigInt(9000), expected: '0.9' },   // 90%
        { basisPoints: BigInt(5000), expected: '0.5' }    // 50%
      ];

      for (const testCase of testCases) {
        mockPublicClient.readContract.mockResolvedValue([
          BigInt(0), BigInt(0), testCase.basisPoints, BigInt(0), BigInt(0),
          false, false, false, false, false
        ]);

        const result = await getAssetLiquidationThreshold('0xtest', mockContext);
        expect(result).toBe(testCase.expected);
      }
    });
  });

  describe('getPositionAssets', () => {
    it('should fetch and process user positions correctly', async () => {
      const mockPositionsData = {
        structuredContent: {
          positions: [{
            healthFactor: '2.45',
            totalCollateralUsd: '10000',
            totalBorrowsUsd: '4000',
            userReserves: [
              {
                underlyingBalance: '1000',
                variableBorrows: '500',
                token: {
                  symbol: 'USDC',
                  tokenUid: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                  decimals: 6
                }
              }
            ]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsData.structuredContent
      });

      // Mock liquidation threshold fetch
      mockPublicClient.readContract.mockResolvedValue([
        BigInt(0), BigInt(0), BigInt(8400), BigInt(0), BigInt(0),
        false, false, false, false, false
      ]);

      const result = await getPositionAssets('0x123...abc', mockContext);

      expect(mockMcpClient.callTool).toHaveBeenCalledWith({
        name: 'getWalletLendingPositions',
        arguments: { walletAddress: '0x123...abc' }
      });

      expect(result.positionSummary).toEqual({
        totalCollateralUsd: '10000',
        totalBorrowsUsd: '4000', 
        currentHealthFactor: '2.45'
      });

      expect(result.assets).toHaveLength(2); // One SUPPLIED, one BORROWED

      // Check SUPPLIED asset
      const suppliedAsset = result.assets.find(a => a.type === 'SUPPLIED');
      expect(suppliedAsset).toEqual({
        type: 'SUPPLIED',
        symbol: 'USDC',
        balance: '1000',
        balanceUsd: '1000', // 1000 * 1.0 price
        currentPrice: '1',
        liquidationThreshold: '0.84'
      });

      // Check BORROWED asset
      const borrowedAsset = result.assets.find(a => a.type === 'BORROWED');
      expect(borrowedAsset).toEqual({
        type: 'BORROWED',
        symbol: 'USDC',
        balance: '500',
        balanceUsd: '500', // 500 * 1.0 price
        currentPrice: '1'
      });
    });

    it('should handle empty positions', async () => {
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: { positions: [] }
      });

      const result = await getPositionAssets('0x123...abc', mockContext);

      expect(result.assets).toHaveLength(0);
      expect(result.positionSummary).toEqual({
        totalCollateralUsd: '0',
        totalBorrowsUsd: '0',
        currentHealthFactor: '0'
      });
    });

    it('should handle MCP client errors', async () => {
      mockMcpClient.callTool.mockResolvedValue({
        isError: true,
        content: [{ text: 'Failed to fetch positions' }]
      });

      await expect(getPositionAssets('0x123...abc', mockContext))
        .rejects.toThrow('Failed to fetch user positions for asset analysis');
    });

    it('should skip assets with zero balances', async () => {
      const mockPositionsData = {
        structuredContent: {
          positions: [{
            healthFactor: '2.0',
            totalCollateralUsd: '5000',
            totalBorrowsUsd: '2000',
            userReserves: [
              {
                underlyingBalance: '0', // Zero supply
                variableBorrows: '0',   // Zero borrow
                token: {
                  symbol: 'USDC',
                  tokenUid: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                  decimals: 6
                }
              }
            ]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsData.structuredContent
      });

      const result = await getPositionAssets('0x123...abc', mockContext);

      expect(result.assets).toHaveLength(0); // No assets with non-zero balances
    });
  });

  describe('getWalletAssets', () => {
    it('should fetch wallet token balances correctly', async () => {
      const mockPositionsData = {
        structuredContent: {
          positions: [{
            userReserves: [
              {
                underlyingBalance: '1000',
                variableBorrows: '500',
                token: {
                  symbol: 'USDC',
                  tokenUid: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                  decimals: 6
                }
              }
            ]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsData.structuredContent
      });

      // Mock wallet balance call
      mockPublicClient.readContract.mockResolvedValue(BigInt('2000000000')); // 2000 USDC (6 decimals)

      const { formatUnits } = await import('viem');
      vi.mocked(formatUnits).mockReturnValue('2000');

      const result = await getWalletAssets('0x123...abc', mockContext, ['USDC']);

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        abi: expect.any(Array),
        functionName: 'balanceOf',
        args: ['0x123...abc']
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'WALLET',
        symbol: 'USDC',
        balance: '2000',
        balanceUsd: '2000',
        currentPrice: '1',
        canSupply: true,
        canRepay: true // Because user is borrowing USDC
      });
    });

    it('should handle zero wallet balances', async () => {
      const mockPositionsData = {
        structuredContent: {
          positions: [{
            userReserves: [{
              underlyingBalance: '1000',
              variableBorrows: '0',
              token: {
                symbol: 'USDC',
                tokenUid: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                decimals: 6
              }
            }]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsData.structuredContent
      });

      // Mock zero wallet balance
      mockPublicClient.readContract.mockResolvedValue(BigInt('0'));
      const { formatUnits } = await import('viem');
      vi.mocked(formatUnits).mockReturnValue('0');

      const result = await getWalletAssets('0x123...abc', mockContext, []);

      expect(result).toHaveLength(0); // No assets with non-zero balances
    });

    it('should handle stablecoin fallback pricing', async () => {
      const mockPositionsData = {
        structuredContent: {
          positions: [{
            userReserves: [{
              underlyingBalance: '1000',
              variableBorrows: '0',
              token: {
                symbol: 'USDC',
                tokenUid: { address: '0xfallbacktest' }, // Use different address to avoid cache
                decimals: 6
              }
            }]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsData.structuredContent
      });

      // Mock wallet balance
      mockPublicClient.readContract.mockResolvedValue(BigInt('1000000000'));
      const { formatUnits } = await import('viem');
      vi.mocked(formatUnits).mockReturnValue('1000');

      // Mock failed price fetch - this will trigger stablecoin fallback
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,  
        statusText: 'Not Found'
      });

      const result = await getWalletAssets('0x123...abc', mockContext, []);

      expect(result).toHaveLength(1);
      expect(result[0].balanceUsd).toBe('1000'); // Fallback to $1.0 for USDC
      expect(result[0].currentPrice).toBe('1.0');
    });

    it('should handle contract call errors gracefully', async () => {
      const mockPositionsData = {
        structuredContent: {
          positions: [{
            userReserves: [{
              underlyingBalance: '1000',
              variableBorrows: '0',
              token: {
                symbol: 'INVALID',
                tokenUid: { address: '0xinvalid' },
                decimals: 18
              }
            }]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsData.structuredContent
      });

      // Mock contract call failure
      mockPublicClient.readContract.mockRejectedValue(new Error('Contract call failed'));

      const result = await getWalletAssets('0x123...abc', mockContext, []);

      expect(result).toHaveLength(0); // Failed contract calls are skipped
    });

    it('should handle empty positions for wallet analysis', async () => {
      mockMcpClient.callTool.mockResolvedValue({
        isError: true,
        content: [{ text: 'No positions found' }]
      });

      const result = await getWalletAssets('0x123...abc', mockContext, []);

      expect(result).toHaveLength(0);
    });
  });

  describe('generateLiquidationPreventionData', () => {
    it('should combine position and wallet assets correctly', async () => {
      // Mock position assets
      const mockPositionsData = {
        structuredContent: {
          positions: [{
            healthFactor: '1.5',
            totalCollateralUsd: '8000',
            totalBorrowsUsd: '5000',
            userReserves: [
              {
                underlyingBalance: '1000',
                variableBorrows: '500',
                token: {
                  symbol: 'USDC',
                  tokenUid: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                  decimals: 6
                }
              }
            ]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsData.structuredContent
      });

      // Mock liquidation threshold
      mockPublicClient.readContract
        .mockResolvedValueOnce([BigInt(0), BigInt(0), BigInt(8400), BigInt(0), BigInt(0), false, false, false, false, false])
        .mockResolvedValueOnce(BigInt('2000000000')); // wallet balance

      const { formatUnits } = await import('viem');
      vi.mocked(formatUnits).mockReturnValue('2000');

      const result = await generateLiquidationPreventionData(
        '0x123...abc',
        mockContext,
        '1.8'
      );

      expect(result.positionSummary).toEqual({
        totalCollateralUsd: '8000',
        totalBorrowsUsd: '5000',
        currentHealthFactor: '1.5'
      });

      expect(result.preventionConfig).toEqual({
        targetHealthFactor: '1.8'
      });

      expect(result.assets).toHaveLength(3); // SUPPLIED, BORROWED, WALLET
      
      const suppliedAssets = result.assets.filter(a => a.type === 'SUPPLIED');
      const borrowedAssets = result.assets.filter(a => a.type === 'BORROWED');
      const walletAssets = result.assets.filter(a => a.type === 'WALLET');

      expect(suppliedAssets).toHaveLength(1);
      expect(borrowedAssets).toHaveLength(1);
      expect(walletAssets).toHaveLength(1);
    });

    it('should use default target health factor when not provided', async () => {
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: { positions: [] }
      });

      const result = await generateLiquidationPreventionData(
        '0x123...abc',
        mockContext
        // No targetHealthFactor provided
      );

      expect(result.preventionConfig.targetHealthFactor).toBe('1.05'); // context.thresholds.critical
    });

    it('should use provided target health factor', async () => {
      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: { positions: [] }
      });

      const result = await generateLiquidationPreventionData(
        '0x123...abc',
        mockContext,
        '2.0'
      );

      expect(result.preventionConfig.targetHealthFactor).toBe('2.0');
    });

    it('should handle complex scenarios with multiple assets', async () => {
      const mockPositionsData = {
        structuredContent: {
          positions: [{
            healthFactor: '1.2',
            totalCollateralUsd: '15000',
            totalBorrowsUsd: '12000',
            userReserves: [
              {
                underlyingBalance: '5000',
                variableBorrows: '0',
                token: {
                  symbol: 'USDC',
                  tokenUid: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                  decimals: 6
                }
              },
              {
                underlyingBalance: '0',
                variableBorrows: '3000',
                token: {
                  symbol: 'DAI',
                  tokenUid: { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1' },
                  decimals: 18
                }
              }
            ]
          }]
        }
      };

      mockMcpClient.callTool.mockResolvedValue({
        isError: false,
        structuredContent: mockPositionsData.structuredContent
      });

      // Mock liquidation threshold for USDC
      mockPublicClient.readContract
        .mockResolvedValueOnce([BigInt(0), BigInt(0), BigInt(8400), BigInt(0), BigInt(0), false, false, false, false, false])
        .mockResolvedValueOnce(BigInt('1000000000')) // USDC wallet balance
        .mockResolvedValueOnce(BigInt('2000000000000000000000')); // DAI wallet balance

      const { formatUnits } = await import('viem');
      vi.mocked(formatUnits)
        .mockReturnValueOnce('1000') // USDC wallet balance
        .mockReturnValueOnce('2000'); // DAI wallet balance

      const result = await generateLiquidationPreventionData(
        '0x123...abc',
        mockContext,
        '1.6'
      );

      expect(result.assets).toHaveLength(4); // 1 SUPPLIED, 1 BORROWED, 2 WALLET
      
      const suppliedAssets = result.assets.filter(a => a.type === 'SUPPLIED');
      const borrowedAssets = result.assets.filter(a => a.type === 'BORROWED');
      const walletAssets = result.assets.filter(a => a.type === 'WALLET');

      expect(suppliedAssets).toHaveLength(1);
      expect(suppliedAssets[0].symbol).toBe('USDC');
      
      expect(borrowedAssets).toHaveLength(1);
      expect(borrowedAssets[0].symbol).toBe('DAI');
      
      expect(walletAssets).toHaveLength(2);
      
      // Check canRepay flags
      const usdcWallet = walletAssets.find(a => a.symbol === 'USDC');
      const daiWallet = walletAssets.find(a => a.symbol === 'DAI');
      
      expect(usdcWallet?.canRepay).toBe(false); // User is not borrowing USDC
      expect(daiWallet?.canRepay).toBe(true);   // User is borrowing DAI
    });
  });
});