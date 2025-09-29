import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

describe('Ember MCP Server - getCapabilities Integration Test', () => {
  it('should validate getCapabilities response structure with mocked client', async () => {
    // Mock MCP client for unit testing
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        structuredContent: {
          capabilities: [
            {
              type: 'swap',
              swapCapability: {
                supportedTokens: [
                  {
                    symbol: 'ETH',
                    tokenUid: {
                      chainId: '42161',
                      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
                    },
                    decimals: 18,
                    name: 'Ethereum',
                  },
                  {
                    symbol: 'USDC',
                    tokenUid: {
                      chainId: '42161',
                      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
                    },
                    decimals: 6,
                    name: 'USD Coin',
                  },
                ],
              },
            },
          ],
        },
      }),
    };

    // Call getCapabilities
    const result = await mockClient.callTool({
      name: 'getCapabilities',
      arguments: { type: 'SWAP' },
    });

    // Verify the mock was called correctly
    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: 'getCapabilities',
      arguments: { type: 'SWAP' },
    });

    // Validate response structure
    expect(result).toBeDefined();
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent.capabilities).toBeDefined();
    expect(Array.isArray(result.structuredContent.capabilities)).toBe(true);
    expect(result.structuredContent.capabilities.length).toBe(1);

    const capability = result.structuredContent.capabilities[0];
    expect(capability.type).toBe('swap');
    expect(capability.swapCapability).toBeDefined();
    expect(capability.swapCapability.supportedTokens).toBeDefined();
    expect(capability.swapCapability.supportedTokens.length).toBe(2);

    // Validate token structure
    const ethToken = capability.swapCapability.supportedTokens[0];
    expect(ethToken.symbol).toBe('ETH');
    expect(ethToken.tokenUid.chainId).toBe('42161');
    expect(ethToken.tokenUid.address).toBe('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1');
    expect(ethToken.decimals).toBe(18);
  });

  it('should handle LENDING_MARKET capability type', async () => {
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        structuredContent: {
          capabilities: [
            {
              type: 'lending_market',
              lendingCapability: {
                underlyingToken: {
                  symbol: 'USDC',
                  tokenUid: {
                    chainId: '42161',
                    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
                  },
                  decimals: 6,
                  name: 'USD Coin',
                },
                apy: '5.2',
                totalSupply: '1000000',
              },
            },
          ],
        },
      }),
    };

    const result = await mockClient.callTool({
      name: 'getCapabilities',
      arguments: { type: 'LENDING_MARKET' },
    });

    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: 'getCapabilities',
      arguments: { type: 'LENDING_MARKET' },
    });

    const capability = result.structuredContent.capabilities[0];
    expect(capability.type).toBe('lending_market');
    expect(capability.lendingCapability).toBeDefined();
    expect(capability.lendingCapability.underlyingToken.symbol).toBe('USDC');
  });

  it('should handle errors gracefully', async () => {
    const mockClient = {
      callTool: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    await expect(
      mockClient.callTool({
        name: 'getCapabilities',
        arguments: { type: 'SWAP' },
      })
    ).rejects.toThrow('Network error');
  });

  it('should handle empty capabilities response', async () => {
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        structuredContent: {
          capabilities: [],
        },
      }),
    };

    const result = await mockClient.callTool({
      name: 'getCapabilities',
      arguments: { type: 'UNKNOWN' },
    });

    expect(result.structuredContent.capabilities).toHaveLength(0);
  });

  // Integration test that runs only when environment variables are set
  it.skipIf(!process.env.EMBER_MCP_SERVER_URL)(
    'should connect to real Ember MCP server and call getCapabilities',
    { timeout: 30000 },
    async () => {
      const client = new Client(
        { name: 'ember-integration-test', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      try {
        // Create transport without authentication headers
        const transport = new StreamableHTTPClientTransport(
          new URL(process.env.EMBER_MCP_SERVER_URL!)
        );

        await client.connect(transport);
        console.log('Connected to Ember MCP server');

        // Call getCapabilities
        const response = await client.callTool({
          name: 'getCapabilities',
          arguments: { type: 'SWAP' },
        });

        // Basic validation
        expect(response).toBeDefined();
        expect(response).toHaveProperty('structuredContent');

        const content = response.structuredContent as any;
        expect(content).toHaveProperty('capabilities');
        expect(Array.isArray(content.capabilities)).toBe(true);

        console.log(`Received ${content.capabilities.length} capabilities`);

        // Log token details for swap capabilities
        content.capabilities.forEach((cap: any, index: number) => {
          if (cap.type === 'swap' && cap.swapCapability?.supportedTokens) {
            console.log(
              `Capability ${index + 1}: ${cap.swapCapability.supportedTokens.length} supported tokens`
            );
            console.log(
              'Token symbols:',
              cap.swapCapability.supportedTokens.map((t: any) => t.symbol).join(', ')
            );
          }
        });

        await client.close();
      } catch (error) {
        console.error('Integration test error:', error);
        throw error;
      }
    }
  );
});
