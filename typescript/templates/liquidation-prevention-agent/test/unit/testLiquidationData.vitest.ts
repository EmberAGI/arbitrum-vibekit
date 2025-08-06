/**
 * Unit Tests for testLiquidationData Tool
 * Tests the debugging/testing tool for liquidation data generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testLiquidationDataTool } from '../../src/tools/testLiquidationData.js';
import type { LiquidationPreventionContext } from '../../src/context/types.js';

// Mock vibekit-core functions
vi.mock('arbitrum-vibekit-core', () => ({
    createSuccessTask: vi.fn().mockImplementation((name, artifacts, message) => ({
        status: { state: 'completed' },
        artifacts,
        message
    })),
    createErrorTask: vi.fn().mockImplementation((name, error) => ({
        status: { state: 'failed' },
        error
    }))
}));

// Mock the generateLiquidationPreventionData utility
vi.mock('../../src/utils/liquidationData.js', () => ({
    generateLiquidationPreventionData: vi.fn()
}));

import { generateLiquidationPreventionData } from '../../src/utils/liquidationData.js';
const mockGenerateLiquidationPreventionData = vi.mocked(generateLiquidationPreventionData);

describe('testLiquidationData Tool', () => {
    let mockContext: LiquidationPreventionContext;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Create mock context
        mockContext = {
            userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6',
            custom: {
                mcpClient: {} as any,
                tokenMap: {
                    USDC: [{ chainId: '42161', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 }],
                    DAI: [{ chainId: '42161', address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', decimals: 18 }],
                },
                account: {} as any,
                executeTransaction: vi.fn(),
                thresholds: { warning: 1.5, danger: 1.2, critical: 1.03 },
                preferences: {
                    targetHealthFactor: 1.5,
                    monitoringInterval: 15,
                    enableAutomaticActions: true,
                    gasOptimization: true,
                },
                monitoring: { intervalMs: 900000, enableAlerts: true },
                strategy: { 
                    default: 'auto', 
                    maxTransactionUsd: 5000, 
                    minSupplyBalanceUsd: 100,
                    riskTolerance: 'moderate'
                }
            }
        };
    });

    describe('Tool Definition', () => {
        it('should have correct tool metadata', () => {
            expect(testLiquidationDataTool.name).toBe('test-liquidation-data');
            expect(testLiquidationDataTool.description).toContain('Generate and display LiquidationPreventionData format');
            expect(testLiquidationDataTool.parameters).toBeDefined();
        });

        it('should have correct parameter schema', () => {
            const schema = testLiquidationDataTool.parameters;
            
            // Test parsing valid parameters
            const validParams = { 
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6',
                targetHealthFactor: '1.8'
            };
            const result = schema.safeParse(validParams);
            expect(result.success).toBe(true);
            
            if (result.success) {
                expect(result.data.userAddress).toBe('0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6');
                expect(result.data.targetHealthFactor).toBe('1.8');
            }
        });

        it('should use default target health factor when not provided', () => {
            const schema = testLiquidationDataTool.parameters;
            const params = { userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6' };
            
            const result = schema.safeParse(params);
            expect(result.success).toBe(true);
            
            if (result.success) {
                expect(result.data.targetHealthFactor).toBe('1.5'); // default value
            }
        });
    });

    describe('Tool Execution - Success Cases', () => {
        it('should successfully generate and display liquidation data', async () => {
            // Mock successful liquidation data generation
            const mockLiquidationData = {
                positionSummary: {
                    currentHealthFactor: '1.25',
                    totalCollateralUsd: '10000.50',
                    totalBorrowsUsd: '5000.25'
                },
                preventionConfig: {
                    targetHealthFactor: '1.5'
                },
                assets: [
                    {
                        symbol: 'USDC',
                        type: 'SUPPLIED' as const,
                        balance: '5000.0',
                        balanceUsd: '5000.0',
                        liquidationThreshold: '0.8',
                        canSupply: true,
                        canRepay: false
                    },
                    {
                        symbol: 'ETH',
                        type: 'SUPPLIED' as const,
                        balance: '2.0',
                        balanceUsd: '5000.5',
                        liquidationThreshold: '0.8',
                        canSupply: true,
                        canRepay: false
                    },
                    {
                        symbol: 'DAI',
                        type: 'BORROWED' as const,
                        balance: '2500.0',
                        balanceUsd: '2500.25',
                        liquidationThreshold: '0.0',
                        canSupply: false,
                        canRepay: true
                    },
                    {
                        symbol: 'USDC',
                        type: 'WALLET' as const,
                        balance: '1000.0',
                        balanceUsd: '1000.0',
                        liquidationThreshold: '0.0',
                        canSupply: true,
                        canRepay: true
                    }
                ]
            };

            mockGenerateLiquidationPreventionData.mockResolvedValue(mockLiquidationData);

            const result = await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6',
                targetHealthFactor: '1.5'
            }, mockContext);

            expect(result.status.state).toBe('completed');
            expect(result.message).toContain('LiquidationPreventionData generated successfully');
            expect(result.message).toContain('Found 4 assets');
            expect(result.message).toContain('2 supplied, 1 borrowed, 1 wallet');
            expect(result.message).toContain('Current HF: 1.25');
            expect(result.message).toContain('Target: 1.5');

            // Verify the generateLiquidationPreventionData was called correctly
            expect(mockGenerateLiquidationPreventionData).toHaveBeenCalledWith(
                '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6',
                mockContext.custom,
                '1.5'
            );
        });

        it('should handle empty asset arrays gracefully', async () => {
            const mockEmptyData = {
                positionSummary: {
                    currentHealthFactor: '0',
                    totalCollateralUsd: '0',
                    totalBorrowsUsd: '0'
                },
                preventionConfig: {
                    targetHealthFactor: '1.5'
                },
                assets: []
            };

            mockGenerateLiquidationPreventionData.mockResolvedValue(mockEmptyData);

            const result = await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6'
            }, mockContext);

            expect(result.status.state).toBe('completed');
            expect(result.message).toContain('Found 0 assets');
            expect(result.message).toContain('0 supplied, 0 borrowed, 0 wallet');
        });

        it('should display detailed asset information in message', async () => {
            const mockLiquidationData = {
                positionSummary: {
                    currentHealthFactor: '1.8',
                    totalCollateralUsd: '15000',
                    totalBorrowsUsd: '8000'
                },
                preventionConfig: {
                    targetHealthFactor: '1.6'
                },
                assets: [
                    {
                        symbol: 'WETH',
                        type: 'SUPPLIED' as const,
                        balance: '5.0',
                        balanceUsd: '10000',
                        liquidationThreshold: '0.82',
                        canSupply: true,
                        canRepay: false
                    },
                    {
                        symbol: 'USDC',
                        type: 'BORROWED' as const,
                        balance: '8000',
                        balanceUsd: '8000',
                        liquidationThreshold: '0.0',
                        canSupply: false,
                        canRepay: true
                    }
                ]
            };

            mockGenerateLiquidationPreventionData.mockResolvedValue(mockLiquidationData);

            const result = await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6',
                targetHealthFactor: '1.6'
            }, mockContext);

            expect(result.message).toContain('WETH: 5.0 ($10,000) | LT: 0.82');
            expect(result.message).toContain('USDC: 8000 ($8,000)');
            expect(result.message).toContain('Total Collateral: $15,000');
            expect(result.message).toContain('Total Borrowed: $8,000');
        });

        it('should use default target health factor when not specified', async () => {
            const mockLiquidationData = {
                positionSummary: {
                    currentHealthFactor: '1.4',
                    totalCollateralUsd: '5000',
                    totalBorrowsUsd: '2000'
                },
                preventionConfig: {
                    targetHealthFactor: '1.5' // default value
                },
                assets: []
            };

            mockGenerateLiquidationPreventionData.mockResolvedValue(mockLiquidationData);

            const result = await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6'
                // targetHealthFactor not provided, which in the real tool would use Zod default "1.5"
            }, mockContext);

            // Since the tool gets undefined in tests, we expect undefined to be passed
            // In real usage, the framework would apply the Zod default
            expect(mockGenerateLiquidationPreventionData).toHaveBeenCalledWith(
                '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6',
                mockContext.custom,
                undefined // In test context, Zod defaults aren't applied
            );

            expect(result.status.state).toBe('completed');
            expect(result.message).toContain('Target: 1.5');
        });
    });

    describe('Tool Execution - Error Cases', () => {
        it('should handle generateLiquidationPreventionData errors', async () => {
            const mockError = new Error('Failed to fetch position data from MCP');
            mockGenerateLiquidationPreventionData.mockRejectedValue(mockError);

            const result = await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6'
            }, mockContext);

            expect(result.status.state).toBe('failed');
            expect(result.error?.message).toBe('Failed to fetch position data from MCP');
        });

        it('should handle non-Error exceptions', async () => {
            mockGenerateLiquidationPreventionData.mockRejectedValue('String error');

            const result = await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6'
            }, mockContext);

            expect(result.status.state).toBe('failed');
            expect(result.error?.message).toContain('Failed to generate liquidation data: String error');
        });

        it('should handle null/undefined responses from generateLiquidationPreventionData', async () => {
            // @ts-ignore - Testing runtime behavior with null response
            mockGenerateLiquidationPreventionData.mockResolvedValue(null);

            const result = await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6'
            }, mockContext);

            // Should not crash, might return an error or handle gracefully
            expect(result.status.state).toBe('failed');
        });
    });

    describe('Console Logging and Debugging', () => {
        it('should log debug information during execution', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            
            const mockLiquidationData = {
                positionSummary: {
                    currentHealthFactor: '1.3',
                    totalCollateralUsd: '5000',
                    totalBorrowsUsd: '3000'
                },
                preventionConfig: {
                    targetHealthFactor: '1.5'
                },
                assets: []
            };

            mockGenerateLiquidationPreventionData.mockResolvedValue(mockLiquidationData);

            await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6',
                targetHealthFactor: '1.5'
            }, mockContext);

            // Should log debugging information
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Testing LiquidationPreventionData generation for: 0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Using target health factor: 1.5')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('RAW LIQUIDATION PREVENTION DATA')
            );

            consoleSpy.mockRestore();
        });

        it('should log error information on failure', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            const mockError = new Error('Test error');
            mockGenerateLiquidationPreventionData.mockRejectedValue(mockError);

            await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6'
            }, mockContext);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '❌ testLiquidationData tool error:',
                mockError
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe('Asset Categorization and Display', () => {
        it('should correctly categorize and display different asset types', async () => {
            const mockLiquidationData = {
                positionSummary: {
                    currentHealthFactor: '1.45',
                    totalCollateralUsd: '20000',
                    totalBorrowsUsd: '12000'
                },
                preventionConfig: {
                    targetHealthFactor: '1.6'
                },
                assets: [
                    {
                        symbol: 'WETH',
                        type: 'SUPPLIED' as const,
                        balance: '6.0',
                        balanceUsd: '12000',
                        liquidationThreshold: '0.82',
                        canSupply: true,
                        canRepay: false
                    },
                    {
                        symbol: 'WBTC',
                        type: 'SUPPLIED' as const,
                        balance: '0.2',
                        balanceUsd: '8000',
                        liquidationThreshold: '0.75',
                        canSupply: true,
                        canRepay: false
                    },
                    {
                        symbol: 'USDC',
                        type: 'BORROWED' as const,
                        balance: '8000',
                        balanceUsd: '8000',
                        liquidationThreshold: '0.0',
                        canSupply: false,
                        canRepay: true
                    },
                    {
                        symbol: 'DAI',
                        type: 'BORROWED' as const,
                        balance: '4000',
                        balanceUsd: '4000',
                        liquidationThreshold: '0.0',
                        canSupply: false,
                        canRepay: true
                    },
                    {
                        symbol: 'USDC',
                        type: 'WALLET' as const,
                        balance: '2000',
                        balanceUsd: '2000',
                        liquidationThreshold: '0.0',
                        canSupply: true,
                        canRepay: true
                    },
                    {
                        symbol: 'ARB',
                        type: 'WALLET' as const,
                        balance: '1000',
                        balanceUsd: '500',
                        liquidationThreshold: '0.0',
                        canSupply: true,
                        canRepay: false
                    }
                ]
            };

            mockGenerateLiquidationPreventionData.mockResolvedValue(mockLiquidationData);

            const result = await testLiquidationDataTool.execute({
                userAddress: '0x742d35Cc6634C0532925a3b8C6697Dbb8d3F4F6',
                targetHealthFactor: '1.6'
            }, mockContext);

            expect(result.status.state).toBe('completed');
            
            // Check asset counts in result message
            expect(result.message).toContain('2 supplied, 2 borrowed, 2 wallet');
            
            // Check supplied assets section
            expect(result.message).toContain('Supplied Assets (2):');
            expect(result.message).toContain('WETH: 6.0 ($12,000) | LT: 0.82');
            expect(result.message).toContain('WBTC: 0.2 ($8,000) | LT: 0.75');
            
            // Check borrowed assets section
            expect(result.message).toContain('Borrowed Assets (2):');
            expect(result.message).toContain('USDC: 8000 ($8,000)');
            expect(result.message).toContain('DAI: 4000 ($4,000)');
            
            // Check wallet assets section
            expect(result.message).toContain('Wallet Assets (2):');
            expect(result.message).toContain('USDC: 2000 ($2,000) | Supply: ✅ | Repay: ✅');
            expect(result.message).toContain('ARB: 1000 ($500) | Supply: ✅ | Repay: ❌');
        });
    });
});