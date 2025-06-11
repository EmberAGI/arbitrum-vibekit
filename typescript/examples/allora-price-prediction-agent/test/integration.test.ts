/**
 * Integration tests for Allora Price Prediction Agent
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Agent, createProviderSelector } from 'arbitrum-vibekit-core';
import { agentConfig } from '../src/index.js';

describe('Allora Price Prediction Agent - Integration Tests', () => {
  let agent: Agent<any, any>;
  let mcpClient: Client;
  let baseUrl: string;
  const port = 3458; // Use a different port to avoid conflicts

  beforeAll(async () => {
    console.log('🚀 Starting Allora Price Prediction Agent for integration testing...');

    // Mock environment variable if not set
    if (!process.env.ALLORA_API_KEY) {
      process.env.ALLORA_API_KEY = 'test-api-key';
    }

    // Debug: Check if AGENT_NAME is set
    console.log('Environment AGENT_NAME:', process.env.AGENT_NAME);
    console.log('Agent config name:', agentConfig.name);

    // Create the agent with the provider selector
    const providers = createProviderSelector({
      openRouterApiKey: process.env.OPENROUTER_API_KEY || 'test-api-key',
    });

    agent = Agent.create(agentConfig, {
      llm: {
        model: providers.openrouter!('google/gemini-2.5-flash-preview'),
      },
      cors: true,
      basePath: '/api/v1',
    });

    // Start the agent
    await agent.start(port, async () => ({
      // Any custom context if needed
    }));
    baseUrl = `http://localhost:${port}`;

    console.log(`✅ Agent started on ${baseUrl}`);

    // Create MCP client
    const sseUrl = `${baseUrl}/api/v1/sse`;
    const transport = new SSEClientTransport(new URL(sseUrl));
    mcpClient = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    await mcpClient.connect(transport);
  });

  afterAll(async () => {
    console.log('🛑 Shutting down test agent...');
    try {
      if (mcpClient) {
        await mcpClient.close();
      }
      await agent.stop();

      // Give the system time to clean up
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Error during test cleanup:', error);
    }
  }, 15000);

  describe('Agent Configuration and Initialization', () => {
    test('Agent should be initialized with an LLM model', () => {
      // This test confirms the agent instance has the llm property correctly set up.
      // Note: This inspects the internal state for testing purposes.
      expect((agent as any).model).toBeDefined();
      expect((agent as any).model.provider).toContain('openrouter');
    });

    test('GET /.well-known/agent.json returns correct AgentCard', async () => {
      const response = await fetch(`${baseUrl}/api/v1/.well-known/agent.json`);
      expect(response.status).toBe(200);
      const agentCard = await response.json();

      // Debug output
      console.log('Received agent card:', JSON.stringify(agentCard, null, 2));
      console.log('Expected name:', 'Allora Price Prediction Agent');
      console.log('Actual name:', agentCard.name);

      expect(agentCard).toHaveProperty('type', 'AgentCard');
      expect(agentCard).toHaveProperty('name', 'Allora Price Prediction Agent');
      expect(agentCard).toHaveProperty('version', '1.0.0');
      expect(agentCard).toHaveProperty('skills');
      expect(agentCard.skills).toHaveLength(1);
      expect(agentCard.skills[0].id).toBe('predict-price');
    });

    test('MCP client can list tools', async () => {
      const tools = await mcpClient.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0].name).toBe('predict-price');
      expect(tools.tools[0].description).toContain('price predictions');
    });
  });

  describe('Price Prediction Skill', () => {
    test('should handle price prediction request (mocked)', async () => {
      // Since we're using a test API key, we'll mock the MCP server responses
      // In a real integration test with a valid API key, this would make actual calls

      // This test verifies the agent is properly configured and the skill is accessible
      const tools = await mcpClient.listTools();
      const pricePredictionTool = tools.tools.find((t) => t.name === 'predict-price');

      expect(pricePredictionTool).toBeDefined();
      expect(pricePredictionTool?.inputSchema).toHaveProperty('properties');
      expect(pricePredictionTool?.inputSchema.properties).toHaveProperty('message');
    });

    test('should get BTC price prediction', async () => {
      const result = await mcpClient.callTool({
        name: 'predict-price',
        arguments: {
          message: 'Get BTC price prediction for the next 24 hours',
        },
      });

      const content = result.content as any[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('resource');

      const task = JSON.parse(content[0].resource.text);

      // The task should succeed
      expect(task.kind).toBe('task');
      expect(task.status.state).toBe('completed');

      // Verify the formatted response contains all expected elements
      const responseText = task.status.message.parts[0].text;
      expect(responseText).toContain('📊 **Price Prediction Results**');
      expect(responseText).toContain('Price prediction for BTC');
      expect(responseText).toMatch(/\d+(\.\d+)?/); // Should contain a numeric value
      expect(responseText).toContain('_Data provided by Allora prediction markets_');
    });

    test('should handle unknown token gracefully', async () => {
      const result = await mcpClient.callTool({
        name: 'predict-price',
        arguments: {
          message: 'What is the price prediction for UNKNOWN_TOKEN_XYZ?',
        },
      });

      const content = result.content as any[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('resource');

      if (content[0].type === 'resource') {
        const resource = content[0].resource;

        // The response might be a task or a message depending on how the agent handles it
        try {
          const task = JSON.parse(resource.text);

          if (task.kind === 'task') {
            // Task response
            expect(task.status.state).toBe('failed');
            expect(task.metadata.error).toBeDefined();
            expect(['AI_ToolExecutionError', 'PredictionError', 'TopicDiscoveryError']).toContain(
              task.metadata.error.name,
            );
            // The error message should indicate no topic found
            expect(task.metadata.error.message).toMatch(/no prediction topic found|failed to get price prediction/i);
          } else if (task.kind === 'message') {
            // Message response (agent might ask for clarification)
            expect(task.role).toBe('agent');
            expect(task.parts[0].text).toBeDefined();
          }
        } catch (e) {
          // If parsing fails, it might be a plain text response
          expect(resource.text).toBeDefined();
        }
      }
    });

    test('should work without timeframe parameter', async () => {
      const result = await mcpClient.callTool({
        name: 'predict-price',
        arguments: {
          message: 'What is the ETH price prediction?',
        },
      });

      const content = result.content as any[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('resource');

      const task = JSON.parse(content[0].resource.text);

      // The task should succeed
      expect(task.kind).toBe('task');
      expect(task.status.state).toBe('completed');

      // Verify the formatted response
      const responseText = task.status.message.parts[0].text;
      expect(responseText).toContain('📊 **Price Prediction Results**');
      expect(responseText).toContain('Price prediction for ETH');
      expect(responseText).toMatch(/\d+(\.\d+)?/); // Should contain a numeric value
      expect(responseText).toContain('_Data provided by Allora prediction markets_');
    });

    test('should validate input parameters', async () => {
      // Test with empty message - agent should ask for clarification
      const result = await mcpClient.callTool({
        name: 'predict-price',
        arguments: {
          message: '',
        },
      });

      const content = result.content as any[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('resource');

      const response = JSON.parse(content[0].resource.text);
      expect(response.kind).toBe('message');
      expect(response.role).toBe('agent');
      // The agent should ask for clarification
      expect(response.parts[0].text).toMatch(/what token would you like|which token|please|specify/i);

      // Test with missing message - this should throw an MCP error
      await expect(
        mcpClient.callTool({
          name: 'predict-price',
          arguments: {} as any, // Type assertion to bypass TypeScript check
        }),
      ).rejects.toThrow('Invalid arguments');
    });
  });
});
