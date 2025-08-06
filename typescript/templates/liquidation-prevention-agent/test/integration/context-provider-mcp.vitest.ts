import { describe, it, expect, vi } from 'vitest';
import { liquidationPreventionSkill } from '../../src/skills/liquidationPrevention.js';

// Mocked MCP client for testing
const mockMcpClient = {
    callTool: vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: "text", text: "Mocked context load" }],
        structuredContent: {
            positions: [
                {
                    symbol: 'USDC',
                    balance: '1000',
                    type: 'SUPPLIED',
                },
                {
                    symbol: 'DAI',
                    balance: '500',
                    type: 'BORROWED',
                },
            ],
        },
    }),
} as any;

const mockTokenMap = {
    USDC: [
        { chainId: '42161', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    ],
    DAI: [
        { chainId: '42161', address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', decimals: 18 },
    ],
};

describe('Context Provider MCP Integration', () => {
    it('should have liquidation prevention skill with MCP server configuration', () => {
        expect(liquidationPreventionSkill).toBeDefined();
        expect(liquidationPreventionSkill.name).toBe('Liquidation Prevention');
        expect(liquidationPreventionSkill.id).toBe('liquidation-prevention');
    });

    it('should load context with a mocked MCP client', async () => {
        const { contextProvider } = await import('../../src/context/provider.js');
        // Provide minimal required env vars for contextProvider
        process.env.USER_PRIVATE_KEY = '0x'.padEnd(66, '1');
        process.env.QUICKNODE_SUBDOMAIN = 'test-subdomain';
        process.env.QUICKNODE_API_KEY = 'test-api-key';
        const context = await contextProvider(
            { mcpClients: { 'liquidation-prevention': mockMcpClient } },
            mockTokenMap,
            mockMcpClient
        );
        expect(context).toBeDefined();
        expect(context.userAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(context.tokenMap.USDC).toBeDefined();
        expect(context.mcpClient).toBe(mockMcpClient);
    });

    it('should generate a supply collateral transaction from a mocked MCP response', async () => {
        const { supplyCollateralTool } = await import('../../src/tools/supplyCollateral.js');
        // Mock the MCP client's callTool to return a valid supply response with proper content format
        const mockSupplyResponse = {
            isError: false,
            structuredContent: {
                tokenUid: {
                    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
                    chainId: '42161'
                },
                amount: '100000000', // 100 USDC with 6 decimals
                walletAddress: '0x000000000000000000000000000000000000dead',
                chainId: '42161',
                transactions: [
                    {
                        type: 'EVM_TX',
                        to: '0x0000000000000000000000000000000000000001',
                        data: '0x456',
                        value: '0',
                        chainId: '42161',
                    },
                ],
            },
        };
        const mcpClient = { callTool: vi.fn().mockResolvedValue(mockSupplyResponse) } as any;
        const context = {
            custom: {
                mcpClient,
                tokenMap: mockTokenMap,
                executeTransaction: vi.fn().mockResolvedValue('Executed!'),
                thresholds: {},
                monitoring: {},
                strategy: {},
            },
        };
        const args = {
            tokenSymbol: 'USDC',
            amount: '100',
            userAddress: '0x000000000000000000000000000000000000dead',
        };
        const result = await supplyCollateralTool.execute(args, context as any);
        expect(result.status.state).toBe('completed');
    });

    it('should generate a repay debt transaction from a mocked MCP response', async () => {
        const { repayDebtTool } = await import('../../src/tools/repayDebt.js');
        // Mock the MCP client's callTool to return a valid repay response with proper content format
        const mockRepayResponse = {
            isError: false,
            structuredContent: {
                tokenUid: {
                    address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
                    chainId: '42161'
                },
                amount: '50000000000000000000', // 50 DAI with 18 decimals
                walletAddress: '0x000000000000000000000000000000000000dead',
                chainId: '42161',
                transactions: [
                    {
                        type: 'EVM_TX',
                        to: '0x0000000000000000000000000000000000000002',
                        data: '0x789',
                        value: '0',
                        chainId: '42161',
                    },
                ],
            },
        };
        const mcpClient = { callTool: vi.fn().mockResolvedValue(mockRepayResponse) } as any;
        const context = {
            custom: {
                mcpClient,
                tokenMap: mockTokenMap,
                executeTransaction: vi.fn().mockResolvedValue('Executed!'),
                thresholds: {},
                monitoring: {},
                strategy: {},
            },
        };
        const args = {
            tokenSymbol: 'DAI',
            amount: '50',
            userAddress: '0x000000000000000000000000000000000000dead',
        };
        const result = await repayDebtTool.execute(args, context as any);
        expect(result.status.state).toBe('completed');
    });
});