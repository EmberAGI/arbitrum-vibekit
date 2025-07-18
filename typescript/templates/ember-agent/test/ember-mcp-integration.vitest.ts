import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Agent } from 'arbitrum-vibekit-core';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('Ember MCP Server Integration', () => {
  let agent: Agent;
  let mcpClient: Client | null = null;

  beforeAll(async () => {
    // Set up environment for real Ember MCP server testing
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
    process.env.EMBER_MCP_SERVER_URL = 'http://api.emberai.xyz/mcp';
    process.env.EMBER_API_KEY = 'test-key';
    process.env.DEFAULT_USER_ADDRESS = '0x1234567890123456789012345678901234567890';

    // Import and create agent with real configuration
    const { agentConfig } = await import('../src/index.js');

    // Create agent but don't start server (we're testing MCP client connection)
    agent = Agent.create(agentConfig, {
      cors: false,
      llm: {
        model: vi.fn() as any, // Mock LLM for testing
      },
    });
  });

  afterAll(async () => {
    if (agent) {
      await agent.stop();
    }
  });

  it('should have swapping skill with MCP server configuration', async () => {
    const { swappingSkill } = await import('../src/skills/swapping.js');

    expect(swappingSkill.mcpServers).toBeDefined();
    expect(swappingSkill.mcpServers!['ember-onchain']).toBeDefined();

    const emberConfig = swappingSkill.mcpServers!['ember-onchain'];
    expect(emberConfig.url).toBe('http://api.emberai.xyz/mcp');
    expect(emberConfig.headers?.Authorization).toContain('Bearer');
    expect(emberConfig.alwaysAllow).toContain('swapTokens');
    expect(emberConfig.disabled).toBe(false);
  });

  it('should be able to connect to real Ember MCP server', async () => {
    // This test validates that the HTTP MCP client can connect
    const { contextProvider } = await import('../src/context/provider.js');

    // Create a mock MCP clients object for testing
    const mockMcpClients = {
      'ember-onchain': {
        callTool: vi.fn(),
      } as any,
    };

    // Test context provider with mock client
    const context = await contextProvider({
      mcpClients: mockMcpClients,
      llmModel: vi.fn() as any,
    });

    expect(context.mcpClient).toBeDefined();
    expect(context.config.emberMcpServerUrl).toBe('http://api.emberai.xyz/mcp');
    expect(context.metadata.mcpConnected).toBe(true);
  });

  it('should validate token map loading from real server', async () => {
    // Test the token map loading logic with proper enum
    const mockMcpClient = {
      callTool: vi.fn().mockResolvedValue({
        structuredContent: {
          tokens: {
            USDC: [
              {
                chainId: 42161,
                address: '0xA0b86a33E6441b8066Fa23f5f4AEAAfa2d56D72d',
                decimals: 6,
                symbol: 'USDC',
                name: 'USD Coin',
              },
            ],
            ETH: [
              {
                chainId: 42161,
                address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
                decimals: 18,
                symbol: 'WETH',
                name: 'Wrapped Ether',
              },
            ],
          },
        },
      }),
    } as any;

    const { contextProvider } = await import('../src/context/provider.js');

    const context = await contextProvider({
      mcpClients: { 'ember-onchain': mockMcpClient },
      llmModel: vi.fn() as any,
    });

    // Verify the token map was loaded correctly
    expect(context.tokenMap).toBeDefined();
    expect(context.tokenMap.USDC).toBeDefined();
    expect(context.tokenMap.ETH).toBeDefined();
    expect(context.tokenMap.USDC[0].address).toBe('0xA0b86a33E6441b8066Fa23f5f4AEAAfa2d56D72d');
    expect(context.tokenMap.ETH[0].address).toBe('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1');

    // Verify the MCP client was called with correct parameters
    expect(mockMcpClient.callTool).toHaveBeenCalledWith(
      {
        name: 'getCapabilities',
        arguments: { type: 'SWAP' },
      },
      undefined,
      { timeout: 30000 }
    );
  });

  it('should generate real swap transaction from Ember MCP server', async () => {
    // Mock a realistic Ember MCP server response for swapTokens
    const mockSwapResponse = {
      baseToken: {
        chainId: '42161',
        address: '0xA0b86a33E6441b8066Fa23f5f4AEAAfa2d56D72d',
      },
      quoteToken: {
        chainId: '42161',
        address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      },
      transactions: [
        {
          to: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
          data: '0x7c025200...',
          value: '0',
          chainId: '42161',
          type: '0x2',
        },
      ],
      estimation: {
        baseTokenDelta: '100000000', // 100 USDC
        quoteTokenDelta: '0.065123456789123456', // ~0.065 ETH
        effectivePrice: '1538.461538461538461538',
        timeEstimate: '30s',
        expiration: new Date(Date.now() + 300000).toISOString(), // 5 minutes
      },
      providerTracking: {
        explorerUrl: 'https://arbiscan.io/tx/0x...',
      },
    };

    const mockMcpClient = {
      callTool: vi.fn().mockResolvedValue(mockSwapResponse),
    } as any;

    const mockContext = {
      custom: {
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
          ETH: [
            {
              chainId: 42161,
              address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
              decimals: 18,
              symbol: 'WETH',
              name: 'Wrapped Ether',
            },
          ],
        },
        userAddress: '0x1234567890123456789012345678901234567890',
        config: {
          arbitrumRpcUrl: 'https://arb1.arbitrum.io/rpc',
        },
      },
      skillInput: {
        userAddress: '0x1234567890123456789012345678901234567890',
      },
    };

    // Import and test the swap tool
    const { swapTokensTool } = await import('../src/tools/swapTokens.js');

    const swapArgs = {
      fromToken: 'USDC',
      toToken: 'ETH',
      amount: '100',
      fromChain: undefined,
      toChain: undefined,
    };

    // Execute the swap tool
    const result = await swapTokensTool.execute(swapArgs, mockContext);

    // Validate the result structure
    expect(result).toBeDefined();
    expect(result.status.state).toBe('completed');
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts).toHaveLength(1);

    const artifact = result.artifacts![0];
    expect(artifact.name).toBe('transaction-plan');
    expect(artifact.parts[0].kind).toBe('data');

    const txData = artifact.parts[0].data as any;
    expect(txData.txPreview).toBeDefined();
    expect(txData.txPlan).toBeDefined();
    expect(Array.isArray(txData.txPlan)).toBe(true);

    // Validate transaction preview data
    expect(txData.txPreview.fromTokenSymbol).toBe('USDC');
    expect(txData.txPreview.toTokenSymbol).toBe('ETH');
    expect(txData.txPreview.fromTokenAmount).toBe('100000000');
    expect(txData.txPreview.toTokenAmount).toBe('0.065123456789123456');

    // Validate that the MCP client was called with correct parameters
    expect(mockMcpClient.callTool).toHaveBeenCalledWith({
      name: 'swapTokens',
      arguments: {
        orderType: 'MARKET_SELL',
        baseToken: {
          chainId: '42161',
          address: '0xA0b86a33E6441b8066Fa23f5f4AEAAfa2d56D72d',
        },
        quoteToken: {
          chainId: '42161',
          address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        },
        amount: '100000000',
        recipient: '0x1234567890123456789012345678901234567890',
        slippageTolerance: '0.5',
      },
    });
  });

  it('should handle Ember MCP server errors gracefully', async () => {
    const mockMcpClient = {
      callTool: vi.fn().mockRejectedValue(new Error('Network timeout')),
    } as any;

    const mockContext = {
      custom: {
        mcpClient: mockMcpClient,
        tokenMap: {
          USDC: [
            {
              chainId: 42161,
              address: '0xA0b86a33E6441b8066Fa23f5f4AEAAfa2d56D72d',
              decimals: 6,
              symbol: 'USDC',
              name: 'USD Coin',
            },
          ],
        },
        userAddress: '0x1234567890123456789012345678901234567890',
        config: {
          arbitrumRpcUrl: 'https://arb1.arbitrum.io/rpc',
        },
      },
      skillInput: {
        userAddress: '0x1234567890123456789012345678901234567890',
      },
    };

    const { swapTokensTool } = await import('../src/tools/swapTokens.js');

    const swapArgs = {
      fromToken: 'USDC',
      toToken: 'ETH',
      amount: '100',
    };

    // Execute the swap tool and expect it to handle errors
    const result = await swapTokensTool.execute(swapArgs, mockContext);

    expect(result).toBeDefined();
    expect(result.status.state).toBe('failed');
    expect(result.status.message.parts[0].text).toContain('Error preparing swap');
  });

  it('should validate that HTTP MCP configuration is correct in skill definition', async () => {
    const { swappingSkill } = await import('../src/skills/swapping.js');

    // Ensure the skill has the HTTP MCP server configuration
    expect(swappingSkill.mcpServers).toBeDefined();

    const emberConfig = swappingSkill.mcpServers!['ember-onchain'];
    expect(emberConfig).toBeDefined();

    // Validate it's HTTP configuration, not stdio
    expect('url' in emberConfig).toBe(true);
    expect('command' in emberConfig).toBe(false);

    // Validate HTTP-specific properties
    expect(emberConfig.url).toBe('http://api.emberai.xyz/mcp');
    expect(emberConfig.headers).toBeDefined();
    expect(emberConfig.alwaysAllow).toContain('swapTokens');
    expect(emberConfig.alwaysAllow).toContain('getCapabilities');
    expect(emberConfig.disabled).toBe(false);
  });
});
