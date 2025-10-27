/**
 * Integration tests for Allora Price Prediction Agent
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Agent, createProviderSelector, type AgentConfig } from '@emberai/arbitrum-vibekit-core';
import { pricePredictionSkill } from '../src/skills/pricePrediction.js';

describe('Allora Price Prediction Agent - Integration Tests', () => {
  let agent: Agent<any, any>;
  let mcpClient: Client;
  let baseUrl: string;
  const port = 3458; // Use a different port to avoid conflicts

  before(async function () {
    this.timeout(30000);
    console.log('🚀 Starting Allora Price Prediction Agent for integration testing...');

    // Mock environment variable if not set
    if (!process.env.ALLORA_API_KEY) {
      process.env.ALLORA_API_KEY = 'test-api-key';
    }

    // Define agent config locally to avoid importing from index.js
    const agentConfig: AgentConfig = {
      name: process.env.AGENT_NAME || 'Allora Price Prediction Agent',
      version: process.env.AGENT_VERSION || '1.0.0',
      description:
        process.env.AGENT_DESCRIPTION ||
        'An AI agent that provides price predictions using Allora prediction markets data',
      skills: [pricePredictionSkill],
      url: 'localhost',
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
    };

    // Debug: Check if AGENT_NAME is set
    console.log('Environment AGENT_NAME:', process.env.AGENT_NAME);
    console.log('Agent config name:', agentConfig.name);

    // Create the agent with the provider selector
    const providers = createProviderSelector({
      openRouterApiKey: process.env.OPENROUTER_API_KEY || 'test-api-key',
    });

    agent = Agent.create(agentConfig, {
      llm: {
        model: providers.openrouter!('x-ai/grok-3-mini'),
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

  after(async function () {
    this.timeout(15000);
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
  });

  describe('Agent Configuration and Initialization', () => {
    it('Agent should be initialized with an LLM model', () => {
      // This test confirms the agent instance has the llm property correctly set up.
      // Note: This inspects the internal state for testing purposes.
      expect((agent as any).model).to.exist;
      expect((agent as any).model.provider).to.contain('openrouter');
    });

    it('GET /.well-known/agent.json returns correct AgentCard', async () => {
      const response = await fetch(`${baseUrl}/api/v1/.well-known/agent.json`);
      expect(response.status).to.equal(200);
      const agentCard = await response.json();

      // Debug output
      console.log('Received agent card:', JSON.stringify(agentCard, null, 2));
      console.log('Expected name:', 'Allora Price Prediction Agent');
      console.log('Actual name:', agentCard.name);

      expect(agentCard).to.have.property('type', 'AgentCard');
      expect(agentCard).to.have.property('name', 'Allora Price Prediction Agent');
      expect(agentCard).to.have.property('version', '1.0.0');
      expect(agentCard).to.have.property('skills');
      expect(agentCard.skills).to.have.lengthOf(1);
      expect(agentCard.skills[0].id).to.equal('predict-price');
    });

    it('MCP client can list tools', async () => {
      const tools = await mcpClient.listTools();
      expect(tools.tools).to.have.lengthOf(1);
      expect(tools.tools[0].name).to.equal('predict-price');
      expect(tools.tools[0].description).to.contain('price predictions');
    });
  });

  describe('Price Prediction Skill', () => {
    it('should handle price prediction request (mocked)', async () => {
      // Since we're using a test API key, we'll mock the MCP server responses
      // In a real integration test with a valid API key, this would make actual calls

      // This test verifies the agent is properly configured and the skill is accessible
      const tools = await mcpClient.listTools();
      const pricePredictionTool = tools.tools.find((t) => t.name === 'predict-price');

      expect(pricePredictionTool).to.exist;
      expect(pricePredictionTool?.inputSchema).to.have.property('properties');
      expect(pricePredictionTool?.inputSchema.properties).to.have.property('message');
    });

    it('should get BTC price prediction', async function () {
      this.timeout(30000); // 30 second timeout for this test
      const result = await mcpClient.callTool({
        name: 'predict-price',
        arguments: {
          message: 'Get BTC price prediction for the next 24 hours',
        },
      });

      const content = result.content as any[];
      expect(content).to.have.lengthOf(1);
      expect(content[0].type).to.equal('resource');

      const task = JSON.parse(content[0].resource.text);

      // The task should succeed
      expect(task.kind).to.equal('task');
      expect(task.status.state).to.equal('completed');

      // Verify the formatted response contains all expected elements
      const responseText = task.status.message.parts[0].text;
      expect(responseText).to.contain('📊 **Price Prediction Results**');
      expect(responseText).to.contain('Price prediction for BTC');
      expect(responseText).to.match(/\d+(\.\d+)?/); // Should contain a numeric value
      expect(responseText).to.contain('_Data provided by Allora prediction markets_');
    });

    it('should handle unknown token gracefully', async function () {
      this.timeout(30000); // 30 second timeout for this test
      const result = await mcpClient.callTool({
        name: 'predict-price',
        arguments: {
          message: 'What is the price prediction for UNKNOWN_TOKEN_XYZ?',
        },
      });

      const content = result.content as any[];
      expect(content).to.have.lengthOf(1);
      expect(content[0].type).to.equal('resource');

      if (content[0].type === 'resource') {
        const resource = content[0].resource;

        // The response might be a task or a message depending on how the agent handles it
        try {
          const task = JSON.parse(resource.text);

          if (task.kind === 'task') {
            // Task response
            expect(task.status.state).to.equal('failed');
            expect(task.metadata.error).to.exist;
            expect(['AI_ToolExecutionError', 'PredictionError', 'TopicDiscoveryError']).to.contain(
              task.metadata.error.name,
            );
            // The error message should indicate no topic found
            expect(task.metadata.error.message).to.match(/no prediction topic found|failed to get price prediction/i);
          } else if (task.kind === 'message') {
            // Message response (agent might ask for clarification)
            expect(task.role).to.equal('agent');
            expect(task.parts[0].text).to.exist;
          }
        } catch (e) {
          // If parsing fails, it might be a plain text response
          expect(resource.text).to.exist;
        }
      }
    });

    it('should work without timeframe parameter', async function () {
      this.timeout(30000); // 30 second timeout for this test
      const result = await mcpClient.callTool({
        name: 'predict-price',
        arguments: {
          message: 'What is the ETH price prediction?',
        },
      });

      const content = result.content as any[];
      expect(content).to.have.lengthOf(1);
      expect(content[0].type).to.equal('resource');

      const task = JSON.parse(content[0].resource.text);

      // The task should succeed
      expect(task.kind).to.equal('task');
      expect(task.status.state).to.equal('completed');

      // Verify the formatted response
      const responseText = task.status.message.parts[0].text;
      expect(responseText).to.contain('📊 **Price Prediction Results**');
      expect(responseText).to.contain('Price prediction for ETH');
      expect(responseText).to.match(/\d+(\.\d+)?/); // Should contain a numeric value
      expect(responseText).to.contain('_Data provided by Allora prediction markets_');
    });

    it('should validate input parameters', async () => {
      // Test with empty message - agent should ask for clarification
      const result = await mcpClient.callTool({
        name: 'predict-price',
        arguments: {
          message: '',
        },
      });

      const content = result.content as any[];
      expect(content).to.have.lengthOf(1);
      expect(content[0].type).to.equal('resource');

      const response = JSON.parse(content[0].resource.text);
      expect(response.kind).to.equal('message');
      expect(response.role).to.equal('agent');
      // The agent should ask for clarification
      expect(response.parts[0].text).to.match(/what token|which token|please|specify/i);

      // Test with missing message - this should throw an MCP error
      try {
        await mcpClient.callTool({
          name: 'predict-price',
          arguments: {} as any, // Type assertion to bypass TypeScript check
        });
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).to.contain('Invalid arguments');
      }
    });
  });
});
