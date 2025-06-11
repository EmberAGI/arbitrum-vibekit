/**
 * Unit tests for Price Prediction Hooks
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { topicDiscoveryHook, formatResponseHook } from '../src/hooks/pricePredictionHooks.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('Price Prediction Hooks', () => {
  describe('topicDiscoveryHook', () => {
    let mockMcpClient: Client;
    let mockContext: any;

    beforeEach(() => {
      // Reset mocks
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
      };
    });

    test('should find topic ID for BTC token', async () => {
      // Mock the list_all_topics response with string topic_id (as it comes from API)
      const mockTopics = [
        { topic_id: '1', topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' },
        { topic_id: '2', topic_name: 'ETH/USD Price Prediction', description: 'Ethereum price' },
      ];

      (mockMcpClient.callTool as any).mockResolvedValue({
        content: [{ text: JSON.stringify(mockTopics) }],
      });

      const args = { token: 'BTC' };
      const result = await topicDiscoveryHook(args, mockContext);

      // Verify MCP client was called correctly
      expect(mockMcpClient.callTool).toHaveBeenCalledWith({
        name: 'list_all_topics',
        arguments: {},
      });

      // Verify result - topicId should be converted to number
      expect(result).toEqual({
        token: 'BTC',
        topicId: 1,
        topicMetadata: 'BTC/USD Price Prediction',
      });
    });

    test('should find topic ID for lowercase token', async () => {
      const mockTopics = [
        { topic_id: '1', topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' },
        { topic_id: '2', topic_name: 'ETH/USD Price Prediction', description: 'Ethereum price' },
      ];

      (mockMcpClient.callTool as any).mockResolvedValue({
        content: [{ text: JSON.stringify(mockTopics) }],
      });

      const args = { token: 'eth' };
      const result = await topicDiscoveryHook(args, mockContext);

      expect(result.topicId).toBe(2);
      expect(result.token).toBe('eth');
    });

    test('should throw error when no topic found', async () => {
      const mockTopics = [{ topic_id: '1', topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

      (mockMcpClient.callTool as any).mockResolvedValue({
        content: [{ text: JSON.stringify(mockTopics) }],
      });

      const args = { token: 'UNKNOWN' };

      await expect(topicDiscoveryHook(args, mockContext)).rejects.toThrow(
        'No prediction topic found for token: UNKNOWN',
      );
    });

    test('should throw error when topic ID cannot be converted to number', async () => {
      const mockTopics = [
        { topic_id: 'invalid-id', topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' },
      ];

      (mockMcpClient.callTool as any).mockResolvedValue({
        content: [{ text: JSON.stringify(mockTopics) }],
      });

      const args = { token: 'BTC' };

      await expect(topicDiscoveryHook(args, mockContext)).rejects.toThrow(
        'Invalid topic ID: invalid-id cannot be converted to a number',
      );
    });

    test('should throw error when MCP client is not available', async () => {
      const contextWithoutClient = {
        custom: {},
        mcpClients: {},
      };
      const args = { token: 'BTC' };

      await expect(topicDiscoveryHook(args, contextWithoutClient)).rejects.toThrow('Allora MCP client not available');
    });

    test('should handle empty topics response', async () => {
      (mockMcpClient.callTool as any).mockResolvedValue({
        content: [{ text: '[]' }],
      });

      const args = { token: 'BTC' };

      await expect(topicDiscoveryHook(args, mockContext)).rejects.toThrow('No prediction topic found for token: BTC');
    });

    test('should handle malformed response gracefully', async () => {
      (mockMcpClient.callTool as any).mockResolvedValue({
        content: [],
      });

      const args = { token: 'BTC' };

      await expect(topicDiscoveryHook(args, mockContext)).rejects.toThrow('No prediction topic found for token: BTC');
    });
  });

  describe('formatResponseHook', () => {
    test('should format response with all fields', async () => {
      const mockResult = {
        status: {
          message: {
            parts: [{ text: 'Price prediction for BTC (24 hours): 50000' }],
          },
        },
      };

      const mockContext = {
        custom: {},
        skillInput: {
          message: 'What is the BTC price prediction for 24 hours?',
        },
      };

      const result = await formatResponseHook(mockResult, mockContext);

      expect(result.status.message.parts[0].text).toContain('📊 **Price Prediction Results**');
      expect(result.status.message.parts[0].text).toContain('Price prediction for BTC (24 hours): 50000');
      expect(result.status.message.parts[0].text).toContain('_Data provided by Allora prediction markets_');
    });

    test('should handle message without timeframe', async () => {
      const mockResult = {
        status: {
          message: {
            parts: [{ text: 'Price prediction for ETH: 2500' }],
          },
        },
      };

      const mockContext = {
        custom: {},
        skillInput: {
          message: 'What is ETH price?',
        },
      };

      const result = await formatResponseHook(mockResult, mockContext);

      expect(result.status.message.parts[0].text).toContain('Price prediction for ETH: 2500');
    });

    test('should return original result if formatting fails', async () => {
      const mockResult = { someUnexpectedStructure: true };
      const mockContext = {
        custom: {},
      };

      const result = await formatResponseHook(mockResult, mockContext);

      // Should return the original result without modification
      expect(result).toEqual(mockResult);
    });

    test('should handle result without proper structure', async () => {
      const mockResult = 'Just a string result';
      const mockContext = {
        custom: {},
        skillInput: {
          message: 'Get ETH price for 8 hours',
        },
      };

      const result = await formatResponseHook(mockResult as any, mockContext);

      // Should still try to format but fall back gracefully
      expect(result).toBe(mockResult);
    });
  });
});
