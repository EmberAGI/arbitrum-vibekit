/**
 * Unit tests for Price Prediction Tool
 */

import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { getPricePredictionTool } from '../src/tools/getPricePrediction.js';
import { VibkitError } from '@emberai/arbitrum-vibekit-core';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Note: Since getPricePredictionTool is wrapped with hooks, we'll test the complete flow
// The hooks are already tested separately in hooks.test.ts

describe('getPricePrediction Tool', () => {
  let mockMcpClient: Client;
  let mockContext: any;

  beforeEach(() => {
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
      skillInput: {
        message: 'Get BTC price prediction for 24 hours',
      },
    };
  });

  it('should successfully get price prediction for BTC', async () => {
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
    (mockMcpClient.callTool as sinon.SinonStub)
      .onFirstCall()
      .resolves({
        content: [{ text: JSON.stringify(mockTopics) }],
      })
      .onSecondCall()
      .resolves({
        content: [{ text: JSON.stringify(mockInference) }],
      });

    const args = { token: 'BTC', timeframe: '24 hours' };
    const result = await getPricePredictionTool.execute(args, mockContext);

    // Verify the tool was called twice (list_all_topics and get_inference_by_topic_id)
    expect((mockMcpClient.callTool as sinon.SinonStub).callCount).to.equal(2);

    // Verify first call was to list_all_topics
    expect((mockMcpClient.callTool as sinon.SinonStub).getCall(0).calledWith({
      name: 'list_all_topics',
      arguments: {},
    })).to.be.true;

    // Verify second call was to get_inference_by_topic_id with correct topic ID
    expect((mockMcpClient.callTool as sinon.SinonStub).getCall(1).calledWith({
      name: 'get_inference_by_topic_id',
      arguments: { topicID: 1 },
    })).to.be.true;

    // Verify result structure
    expect(result).to.have.property('id');
    expect(result).to.have.property('status');
    expect(result.status.state).to.equal('completed');

    // The post-hook should have formatted the message
    const messageText = result.status.message.parts[0].text;
    expect(messageText).to.contain('📊 **Price Prediction Results**');
    expect(messageText).to.contain('Price prediction for BTC (24 hours): 50000.123456');
    expect(messageText).to.contain('_Data provided by Allora prediction markets_');
  });

  it('should handle unknown token error', async () => {
    // Mock list_all_topics response with no matching token
    const mockTopics = [{ topic_id: 1, topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

    (mockMcpClient.callTool as sinon.SinonStub).resolves({
      content: [{ text: JSON.stringify(mockTopics) }],
    });

    const args = { token: 'UNKNOWN' };

    // The pre-hook should throw an error for unknown token
    try {
      await getPricePredictionTool.execute(args, mockContext);
      expect.fail('Expected error to be thrown');
    } catch (error: any) {
      expect(error.message).to.contain('No prediction topic found for token: UNKNOWN');
    }
  });

  it('should handle missing MCP client', async () => {
    const contextWithoutClient = {
      custom: {},
      mcpClients: {},
      skillInput: { message: 'What is BTC price?' },
    };

    const args = { token: 'BTC' };

    try {
      await getPricePredictionTool.execute(args, contextWithoutClient);
      expect.fail('Expected error to be thrown');
    } catch (error: any) {
      expect(error.message).to.contain('Allora MCP client not available');
    }
  });

  it('should handle inference API error', async () => {
    // Mock successful topic discovery
    const mockTopics = [{ topic_id: 1, topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

    (mockMcpClient.callTool as sinon.SinonStub)
      .onFirstCall()
      .resolves({
        content: [{ text: JSON.stringify(mockTopics) }],
      })
      .onSecondCall()
      .rejects(new Error('API Error'));

    const args = { token: 'BTC' };
    const result = await getPricePredictionTool.execute(args, mockContext);

    // Should return an error task
    expect(result).to.have.property('id');
    expect(result.status.state).to.equal('failed');
    expect(result.metadata.error).to.exist;
    expect(result.metadata.error.name).to.equal('PredictionError');
    expect(result.metadata.error.message).to.contain('Failed to get price prediction');
  });

  it('should handle empty inference response', async () => {
    const mockTopics = [{ topic_id: 1, topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

    (mockMcpClient.callTool as sinon.SinonStub)
      .onFirstCall()
      .resolves({
        content: [{ text: JSON.stringify(mockTopics) }],
      })
      .onSecondCall()
      .resolves({
        content: [],
      });

    const args = { token: 'BTC' };
    const result = await getPricePredictionTool.execute(args, mockContext);

    expect(result.status.state).to.equal('completed');
    // Should show N/A for missing value
    expect(result.status.message.parts[0].text).to.contain('N/A');
  });

  it('should work without timeframe parameter', async () => {
    const mockTopics = [{ topic_id: 1, topic_name: 'BTC/USD Price Prediction', description: 'Bitcoin price' }];

    const mockInference = {
      inference_data: {
        network_inference_normalized: '50000.789',
      },
    };

    (mockMcpClient.callTool as sinon.SinonStub)
      .onFirstCall()
      .resolves({
        content: [{ text: JSON.stringify(mockTopics) }],
      })
      .onSecondCall()
      .resolves({
        content: [{ text: JSON.stringify(mockInference) }],
      });

    // Update context to not have timeframe in message
    mockContext.skillInput = { message: 'What is BTC price?' };

    const args = { token: 'BTC' };
    const result = await getPricePredictionTool.execute(args, mockContext);

    expect(result.status.state).to.equal('completed');
    const messageText = result.status.message.parts[0].text;
    expect(messageText).to.contain('Price prediction for BTC: 50000.789');
    expect(messageText).to.not.contain('('); // No timeframe in parentheses
  });
});
