/**
 * Unit tests for Price Prediction Hooks
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { topicDiscoveryHook, formatResponseHook } from '../src/hooks/pricePredictionHooks.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('Price Prediction Hooks', () => {
  describe('topicDiscoveryHook', () => {
    let mockMcpClient: Client;
    let mockContext: any;

    beforeEach(() => {
      // Reset mocks
      sinon.restore();

      // Create mock MCP client
      mockMcpClient = {
        callTool: sinon.stub(),
      } as any;

      // Create mock context
      mockContext = {
        custom: {},
        mcpClients: {
          '@alloralabs/mcp-server': mockMcpClient,
        },
      };
    });

    it('should find topic ID for BTC token', async () => {
      // Mock the list_all_topics response with string topic_id (as it comes from API)
      const mockTopics = [
        { topic_id: '1', topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' },
        { topic_id: '2', topic_name: 'ETH/USD Price Prediction', description: 'Ethereum price' },
      ];

      (mockMcpClient.callTool as sinon.SinonStub).resolves({
        content: [{ text: JSON.stringify(mockTopics) }],
      });

      const args = { token: 'BTC' };
      const result = await topicDiscoveryHook(args, mockContext);

      // Verify MCP client was called correctly
      expect((mockMcpClient.callTool as sinon.SinonStub).calledWith({
        name: 'list_all_topics',
        arguments: {},
      })).to.be.true;

      // Verify result - topicId should be converted to number
      expect(result).to.deep.equal({
        token: 'BTC',
        topicId: 1,
        topicMetadata: 'BTC/USD Price Prediction',
      });
    });

    it('should find topic ID for lowercase token', async () => {
      const mockTopics = [
        { topic_id: '1', topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' },
        { topic_id: '2', topic_name: 'ETH/USD Price Prediction', description: 'Ethereum price' },
      ];

      (mockMcpClient.callTool as sinon.SinonStub).resolves({
        content: [{ text: JSON.stringify(mockTopics) }],
      });

      const args = { token: 'eth' };
      const result = await topicDiscoveryHook(args, mockContext);

      expect(result.topicId).to.equal(2);
      expect(result.token).to.equal('eth');
    });

    it('should throw error when no topic found', async () => {
      const mockTopics = [{ topic_id: '1', topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

      (mockMcpClient.callTool as sinon.SinonStub).resolves({
        content: [{ text: JSON.stringify(mockTopics) }],
      });

      const args = { token: 'UNKNOWN' };

      try {
        await topicDiscoveryHook(args, mockContext);
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).to.contain('No prediction topic found for token: UNKNOWN');
      }
    });

    it('should throw error when topic ID cannot be converted to number', async () => {
      const mockTopics = [
        { topic_id: 'invalid-id', topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' },
      ];

      (mockMcpClient.callTool as sinon.SinonStub).resolves({
        content: [{ text: JSON.stringify(mockTopics) }],
      });

      const args = { token: 'BTC' };

      try {
        await topicDiscoveryHook(args, mockContext);
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).to.contain('Invalid topic ID: invalid-id cannot be converted to a number');
      }
    });

    it('should throw error when MCP client is not available', async () => {
      const contextWithoutClient = {
        custom: {},
        mcpClients: {},
      };
      const args = { token: 'BTC' };

      try {
        await topicDiscoveryHook(args, contextWithoutClient);
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).to.contain('Allora MCP client not available');
      }
    });

    it('should handle empty topics response', async () => {
      (mockMcpClient.callTool as sinon.SinonStub).resolves({
        content: [{ text: '[]' }],
      });

      const args = { token: 'BTC' };

      try {
        await topicDiscoveryHook(args, mockContext);
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).to.contain('No prediction topic found for token: BTC');
      }
    });

    it('should handle malformed response gracefully', async () => {
      (mockMcpClient.callTool as sinon.SinonStub).resolves({
        content: [],
      });

      const args = { token: 'BTC' };

      try {
        await topicDiscoveryHook(args, mockContext);
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).to.contain('No prediction topic found for token: BTC');
      }
    });
  });

  describe('formatResponseHook', () => {
    it('should format response with all fields', async () => {
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

      expect(result.status.message.parts[0].text).to.contain('📊 **Price Prediction Results**');
      expect(result.status.message.parts[0].text).to.contain('Price prediction for BTC (24 hours): 50000');
      expect(result.status.message.parts[0].text).to.contain('_Data provided by Allora prediction markets_');
    });

    it('should handle message without timeframe', async () => {
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

      expect(result.status.message.parts[0].text).to.contain('Price prediction for ETH: 2500');
    });

    it('should return original result if formatting fails', async () => {
      const mockResult = { someUnexpectedStructure: true };
      const mockContext = {
        custom: {},
      };

      const result = await formatResponseHook(mockResult, mockContext);

      // Should return the original result without modification
      expect(result).to.deep.equal(mockResult);
    });

    it('should handle result without proper structure', async () => {
      const mockResult = 'Just a string result';
      const mockContext = {
        custom: {},
        skillInput: {
          message: 'Get ETH price for 8 hours',
        },
      };

      const result = await formatResponseHook(mockResult as any, mockContext);

      // Should still try to format but fall back gracefully
      expect(result).to.equal(mockResult);
    });
  });
});
