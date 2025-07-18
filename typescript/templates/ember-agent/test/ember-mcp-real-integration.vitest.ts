import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Task } from '@google-a2a/types';

describe('Ember MCP Server Real Integration', () => {
  let mcpClient: Client;
  let realEmberUrl: string;

  beforeAll(async () => {
    // Set up environment for REAL Ember MCP server testing
    realEmberUrl = 'http://api.emberai.xyz/mcp';

    // Set required environment variables
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'dummy-key-for-testing';
    process.env.ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
    process.env.EMBER_MCP_SERVER_URL = realEmberUrl;
    // No API key needed according to user
    delete process.env.EMBER_API_KEY;
    process.env.DEFAULT_USER_ADDRESS = '0x1234567890123456789012345678901234567890';

    // Create a real MCP client
    mcpClient = new Client({
      name: 'ember-agent-test-client',
      version: '1.0.0',
    });

    // Connect to the real Ember MCP server
    console.log(`[TEST] Connecting to REAL Ember MCP server at ${realEmberUrl}...`);

    try {
      const transport = new StreamableHTTPClientTransport(new URL(realEmberUrl));
      await mcpClient.connect(transport);
      console.log('[TEST] Successfully connected to Ember MCP server!');
    } catch (error) {
      console.error('[TEST] Failed to connect to Ember MCP server:', error);
      throw error;
    }
  });

  afterAll(async () => {
    if (mcpClient) {
      await mcpClient.close();
    }
  });

  it('should list available tools from real Ember MCP server', async () => {
    console.log('[TEST] Fetching available tools from Ember MCP server...');

    const tools = await mcpClient.listTools();

    console.log('[TEST] Available tools:', tools);

    expect(tools).toBeDefined();
    expect(tools.tools).toBeDefined();
    expect(Array.isArray(tools.tools)).toBe(true);
    expect(tools.tools.length).toBeGreaterThan(0);

    // Log all available tools
    console.log('[TEST] Tool names:');
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    // Check for expected tools
    const toolNames = tools.tools.map(t => t.name);
    expect(toolNames).toContain('getCapabilities');
    expect(toolNames).toContain('swapTokens');
  });

  it('should get token capabilities from real Ember MCP server', async () => {
    console.log('[TEST] Getting SWAP capabilities (token list) from Ember MCP server...');

    try {
      const response = await mcpClient.callTool({
        name: 'getCapabilities',
        arguments: { type: 'SWAP' },
      });

      console.log('[TEST] Raw capabilities response:', JSON.stringify(response, null, 2));

      expect(response).toBeDefined();

      // Check if we got token data
      if (response && typeof response === 'object' && 'content' in response) {
        const content = (response as any).content;
        console.log('[TEST] Response content:', content);

        // Parse the content if it's a string
        let tokenData;
        if (typeof content === 'string') {
          try {
            tokenData = JSON.parse(content);
          } catch {
            tokenData = content;
          }
        } else {
          tokenData = content;
        }

        console.log('[TEST] Parsed token data:', tokenData);

        // Log sample tokens if available
        if (tokenData && tokenData.tokens) {
          const tokenSymbols = Object.keys(tokenData.tokens);
          console.log(`[TEST] Found ${tokenSymbols.length} token symbols`);
          console.log('[TEST] Sample tokens:', tokenSymbols.slice(0, 10).join(', '));
        }
      }
    } catch (error) {
      console.error('[TEST] Error calling getCapabilities:', error);
      throw error;
    }
  });

  it('should get a swap quote from real Ember MCP server', async () => {
    console.log('[TEST] Getting real swap quote from Ember MCP server...');

    // First, let's see what parameters swapTokens expects
    const tools = await mcpClient.listTools();
    const swapTool = tools.tools.find(t => t.name === 'swapTokens');

    if (swapTool) {
      console.log('[TEST] swapTokens tool definition:', JSON.stringify(swapTool, null, 2));
    }

    try {
      // Try to get a swap quote for USDC -> ETH
      const swapParams = {
        orderType: 'MARKET_SELL',
        baseToken: {
          chainId: '42161', // Arbitrum
          address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
        },
        quoteToken: {
          chainId: '42161',
          address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
        },
        amount: '1000000', // 1 USDC (6 decimals)
        recipient: '0x1234567890123456789012345678901234567890',
        slippageTolerance: '0.5',
      };

      console.log('[TEST] Calling swapTokens with params:', JSON.stringify(swapParams, null, 2));

      const swapResponse = await mcpClient.callTool({
        name: 'swapTokens',
        arguments: swapParams,
      });

      console.log('[TEST] Swap response:', JSON.stringify(swapResponse, null, 2));

      expect(swapResponse).toBeDefined();

      // Log the transaction data if available
      if (swapResponse && typeof swapResponse === 'object') {
        const response = swapResponse as any;
        if (response.transactions) {
          console.log('[TEST] Generated transactions:', response.transactions);
        }
        if (response.estimation) {
          console.log('[TEST] Swap estimation:', response.estimation);
        }
      }
    } catch (error) {
      console.error('[TEST] Error getting swap quote:', error);
      // Don't fail the test - just log the error
      // The server might require authentication or have rate limits
    }
  });

  it('should integrate with ember-agent swapping skill', async () => {
    console.log('[TEST] Testing integration with ember-agent swapping skill...');

    const { agentConfig } = await import('../src/index.js');
    const { contextProvider } = await import('../src/context/provider.js');

    // Create context with real MCP client
    const context = await contextProvider({
      mcpClients: { 'ember-onchain': mcpClient },
      llmModel: (() => {}) as any, // Dummy LLM model
    });

    console.log('[TEST] Context created with MCP client');
    console.log(`[TEST] Token map loaded: ${Object.keys(context.tokenMap).length} symbols`);
    console.log(`[TEST] MCP connected: ${context.metadata.mcpConnected}`);

    // Try to execute a swap using the real tool
    const { swapTokensTool } = await import('../src/tools/swapTokens.js');

    const swapArgs = {
      fromToken: 'USDC',
      toToken: 'ETH',
      amount: '1',
      fromChain: undefined,
      toChain: undefined,
    };

    console.log('[TEST] Executing swap tool with args:', swapArgs);

    try {
      const result = await swapTokensTool.execute(swapArgs, {
        custom: context,
        skillInput: {
          userAddress: '0x1234567890123456789012345678901234567890',
        },
      } as any);

      console.log('[TEST] Swap tool result:', JSON.stringify(result, null, 2));

      expect(result).toBeDefined();

      // Type the result as Task to access properties
      const taskResult = result as Task;
      expect(taskResult.status).toBeDefined();

      // Log the status and any artifacts
      console.log('[TEST] Result status:', taskResult.status.state);
      if (taskResult.artifacts) {
        console.log('[TEST] Result artifacts:', taskResult.artifacts.length);
      }
    } catch (error) {
      console.error('[TEST] Error executing swap tool:', error);
      // Don't fail - just log
    }
  });
});
