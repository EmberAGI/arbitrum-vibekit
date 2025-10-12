import { describe, it, expect, vi } from 'vitest';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { swappingSkill } from '../src/skills/swapping.js';

describe('Ember MCP Server Integration', () => {
  it('should have swapping skill with MCP server configuration', () => {
    expect(swappingSkill.mcpServers).toBeDefined();

    const emberConfig = swappingSkill.mcpServers!['ember-onchain'];
    if (!emberConfig || !('url' in emberConfig)) {
      throw new Error('Expected HttpMcpConfig');
    }
    expect(emberConfig.url).toBe('https://api.emberai.xyz/mcp');
    expect(emberConfig.alwaysAllow).toContain('swapTokens');
    expect(emberConfig.disabled).toBe(false);
  });

  it('should validate token map loading with a mocked MCP client', async () => {
    const mockMcpClient = {
      callTool: vi.fn().mockResolvedValue({
        structuredContent: {
          capabilities: [
            {
              type: 'swap',
              swapCapability: {
                supportedTokens: [
                  {
                    symbol: 'WBTC',
                    tokenUid: {
                      chainId: '42161',
                      address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
                    },
                    decimals: 8,
                    name: 'Wrapped BTC',
                  },
                ],
              },
            },
          ],
        },
      }),
    } as any;

    const { contextProvider } = await import('../src/context/provider.js');
    const context = await contextProvider({
      mcpClients: { 'ember-onchain': mockMcpClient },
      llmModel: {} as any,
    });

    expect(context.tokenMap).toBeDefined();
    expect(Object.keys(context.tokenMap).length).toBeGreaterThan(0);
    expect(context.tokenMap.WBTC).toBeDefined();
    expect(context.tokenMap.WBTC![0]!.address).toBe('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f');
  });

  it('should generate a swap transaction from a mocked MCP response', async () => {
    const mockSwapResponse = {
      structuredContent: {
        status: 'SUCCESS',
        orderType: 'MARKET_SELL',
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x0000000000000000000000000000000000000001',
            data: '0x456',
            value: '0',
            chainId: '42161',
          },
        ],
        baseToken: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: '42161' },
        quoteToken: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', chainId: '42161' },
        chainId: '42161',
      },
    };
    const mockMcpClient = { callTool: vi.fn().mockResolvedValue(mockSwapResponse) } as any;

    const { swapTokensTool } = await import('../src/tools/swapTokens.js');
    const context = {
      mcpClient: mockMcpClient,
      tokenMap: {
        USDC: [
          {
            chainId: 42161,
            address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin',
          },
        ],
        WETH: [
          {
            chainId: 42161,
            address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            decimals: 18,
            symbol: 'WETH',
            name: 'Wrapped Ether',
          },
        ],
      },
      config: { arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL },
    };

    const swapArgs = {
      fromToken: 'USDC',
      toToken: 'WETH',
      amount: '1',
      fromChain: 'Arbitrum',
      toChain: 'Arbitrum',
    };

    const result = (await swapTokensTool.execute(swapArgs, {
      custom: context,
      skillInput: { userAddress: '0x000000000000000000000000000000000000dead' },
    } as any)) as Task;

    expect(result.status.state).toBe('completed');
    expect(result.artifacts).toBeDefined();
    if (!result.artifacts) throw new Error('Artifacts not found');
    expect(result.artifacts.length).toBeGreaterThan(0);
    const artifact = result.artifacts[0];
    if (!artifact) throw new Error('Artifact not found');
    expect(artifact.name).toBe('transaction-plan');
  });
});
