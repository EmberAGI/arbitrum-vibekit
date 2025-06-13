/**
 * Unit tests for Price Prediction Tool
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getPricePredictionTool } from '../src/tools/getPricePrediction.js';
import { VibkitError } from 'arbitrum-vibekit-core';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Note: Since getPricePredictionTool is wrapped with hooks, we'll test the complete flow
// The hooks are already tested separately in hooks.test.ts

describe('getPricePrediction Tool', () => {
  let mockMcpClient: Client;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock MCP client
    mockMcpClient = {
      callTool: vi.fn(),
    } as any;

    // Create mock context
    mockContext = {
      custom: {},
      mcpClients: {
        '@alloralabs/mcp-server': mockMcpClient,
      },
      skillInput: {
        message: 'Get BTC price prediction for 24 hours',
      },
    };
  });

  test('should successfully get price prediction for BTC', async () => {
    // Mock list_all_topics response (for pre-hook)
    const mockTopics = [
      { topic_id: 1, topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' },
      { topic_id: 2, topic_name: 'ETH/USD Price Prediction', description: 'Ethereum price' },
    ];

    // Mock get_inference_by_topic_id response
    const mockInference = {
      inference_data: {
        network_inference_normalized: '50000.123456',
      },
    };

    // Set up mock responses in order
    (mockMcpClient.callTool as any)
      .mockResolvedValueOnce({
        content: [{ text: JSON.stringify(mockTopics) }],
      })
      .mockResolvedValueOnce({
        content: [{ text: JSON.stringify(mockInference) }],
      });

    const args = { token: 'BTC', timeframe: '24 hours' };
    const result = await getPricePredictionTool.execute(args, mockContext);

    // Verify the tool was called twice (list_all_topics and get_inference_by_topic_id)
    expect(mockMcpClient.callTool).toHaveBeenCalledTimes(2);

    // Verify first call was to list_all_topics
    expect(mockMcpClient.callTool).toHaveBeenNthCalledWith(1, {
      name: 'list_all_topics',
      arguments: {},
    });

    // Verify second call was to get_inference_by_topic_id with correct topic ID
    expect(mockMcpClient.callTool).toHaveBeenNthCalledWith(2, {
      name: 'get_inference_by_topic_id',
      arguments: { topicID: 1 },
    });

    // Verify result structure
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('status');
    expect(result.status.state).toBe('completed');

    // The post-hook should have formatted the message
    const messageText = result.status.message.parts[0].text;
    expect(messageText).toContain('📊 **Price Prediction Results**');
    expect(messageText).toContain('Price prediction for BTC (24 hours): 50000.123456');
    expect(messageText).toContain('_Data provided by Allora prediction markets_');
  });

  test('should handle unknown token error', async () => {
    // Mock list_all_topics response with no matching token
    const mockTopics = [{ topic_id: 1, topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

    (mockMcpClient.callTool as any).mockResolvedValueOnce({
      content: [{ text: JSON.stringify(mockTopics) }],
    });

    const args = { token: 'UNKNOWN' };

    // The pre-hook should throw an error for unknown token
    await expect(getPricePredictionTool.execute(args, mockContext)).rejects.toThrow(
      'No prediction topic found for token: UNKNOWN',
    );
  });

  test('should handle missing MCP client', async () => {
    const contextWithoutClient = {
      custom: {},
      mcpClients: {},
      skillInput: { message: 'What is BTC price?' },
    };

    const args = { token: 'BTC' };

    await expect(getPricePredictionTool.execute(args, contextWithoutClient)).rejects.toThrow(
      'Allora MCP client not available',
    );
  });

  test('should handle inference API error', async () => {
    // Mock successful topic discovery
    const mockTopics = [{ topic_id: 1, topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

    (mockMcpClient.callTool as any)
      .mockResolvedValueOnce({
        content: [{ text: JSON.stringify(mockTopics) }],
      })
      .mockRejectedValueOnce(new Error('API Error'));

    const args = { token: 'BTC' };
    const result = await getPricePredictionTool.execute(args, mockContext);

    // Should return an error task
    expect(result).toHaveProperty('id');
    expect(result.status.state).toBe('failed');
    expect(result.metadata.error).toBeDefined();
    expect(result.metadata.error.name).toBe('PredictionError');
    expect(result.metadata.error.message).toContain('Failed to get price prediction');
  });

  test('should handle empty inference response', async () => {
    const mockTopics = [{ topic_id: 1, topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

    (mockMcpClient.callTool as any)
      .mockResolvedValueOnce({
        content: [{ text: JSON.stringify(mockTopics) }],
      })
      .mockResolvedValueOnce({
        content: [],
      });

    const args = { token: 'BTC' };
    const result = await getPricePredictionTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    // Should show N/A for missing value
    expect(result.status.message.parts[0].text).toContain('N/A');
  });

  test('should work without timeframe parameter', async () => {
    const mockTopics = [{ topic_id: 1, topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

    const mockInference = {
      inference_data: {
        network_inference_normalized: '50000.789',
      },
    };

    (mockMcpClient.callTool as any)
      .mockResolvedValueOnce({
        content: [{ text: JSON.stringify(mockTopics) }],
      })
      .mockResolvedValueOnce({
        content: [{ text: JSON.stringify(mockInference) }],
      });

    // Update context to not have timeframe in message
    mockContext.skillInput = { message: 'What is BTC price?' };

    const args = { token: 'BTC' };
    const result = await getPricePredictionTool.execute(args, mockContext);

    expect(result.status.state).toBe('completed');
    const messageText = result.status.message.parts[0].text;
    expect(messageText).toContain('Price prediction for BTC: 50000.789');
    expect(messageText).not.toContain('('); // No timeframe in parentheses
  });
});
