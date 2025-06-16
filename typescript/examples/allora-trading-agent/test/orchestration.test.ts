import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Agent } from 'arbitrum-vibekit-core';
import { tradingSkill } from '../src/index';

// Mock the external MCP servers
vi.mock('@alloralabs/mcp-server', () => ({}));
vi.mock('ember-mcp-tool-server', () => ({}));

describe('Allora Trading Agent - Orchestration Tests', () => {
  const mockContext: any = {
    mcpClients: {
      '@alloralabs/mcp-server': {
        callTool: vi.fn(),
      },
      'ember-mcp-tool-server': {
        callTool: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockContext.mcpClients['@alloralabs/mcp-server'].callTool.mockClear();
    mockContext.mcpClients['ember-mcp-tool-server'].callTool.mockClear();
  });

  test('getPredictionTool should call the Allora MCP server', async () => {
    // Setup the mock response
    const mockPrediction = { some: 'prediction data' };
    mockContext.mcpClients['@alloralabs/mcp-server'].callTool.mockResolvedValue(mockPrediction);

    const getPredictionTool = tradingSkill.tools.find((t) => t.name === 'getPrediction');
    expect(getPredictionTool).toBeDefined();

    const result = await getPredictionTool!.execute({ topicId: 'BTC' }, mockContext);

    expect(mockContext.mcpClients['@alloralabs/mcp-server'].callTool).toHaveBeenCalledWith({
      name: 'get-price-prediction',
      arguments: { topicId: 'BTC' },
    });

    // Check if the result is a success task and contains the mocked prediction
    expect(result.status.state).toBe('completed');
    expect(JSON.parse(result.artifacts[0].content as string)).toEqual(mockPrediction);
  });

  test('executeTradeTool should call the Ember MCP server', async () => {
    const mockTradeResult = { txHash: '0x123' };
    mockContext.mcpClients['ember-mcp-tool-server'].callTool.mockResolvedValue(mockTradeResult);

    const executeTradeTool = tradingSkill.tools.find((t) => t.name === 'executeTrade');
    expect(executeTradeTool).toBeDefined();

    const tradeArgs = {
      fromTokenAddress: '0xA',
      fromTokenChainId: '1',
      toTokenAddress: '0xB',
      toTokenChainId: '1',
      amount: '100',
      userAddress: '0xC',
    };
    const result = await executeTradeTool!.execute(tradeArgs, mockContext);

    expect(mockContext.mcpClients['ember-mcp-tool-server'].callTool).toHaveBeenCalledWith({
      name: 'swapTokens',
      arguments: tradeArgs,
    });

    expect(result.status.state).toBe('completed');
    expect(JSON.parse(result.artifacts[0].content as string)).toEqual(mockTradeResult);
  });
});
