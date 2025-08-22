#!/usr/bin/env node

/**
 * Simple MCP client test for RWA Agent
 * This shows how to properly call the agent using MCP SDK
 */

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const PORT = 3008;
const BASE_URL = `http://localhost:${PORT}`;

async function testAgent() {
  console.log('🧪 Testing RWA Investment Agent with proper MCP client...');
  
  let mcpClient = null;
  let transport = null;
  
  try {
    // Create MCP client
    mcpClient = new Client(
      { name: "TestClient", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );

    // Create SSE transport to /sse endpoint
    transport = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    
    console.log('🔌 Connecting to agent via SSE...');
    await mcpClient.connect(transport);
    console.log('✅ Connected successfully!');

    // List available tools
    console.log('🔍 Discovering available tools...');
    const toolsResponse = await mcpClient.listTools();
    console.log('📋 Available tools:', toolsResponse.tools.map(t => t.name));

    // Test manual handler first
    console.log('\n🧪 TEST 1: Manual Handler (test-skill)');
    const testResult = await mcpClient.callTool({
      name: 'test-skill',
      arguments: {
        message: 'Hello from MCP client test!'
      }
    });
    console.log('✅ Manual handler result:', testResult);

    // Test LLM orchestration
    console.log('\n🏠 TEST 2: LLM Orchestration (rwa-asset-discovery)');
    const assetResult = await mcpClient.callTool({
      name: 'rwa-asset-discovery',
      arguments: {
        instruction: 'Find real estate investments with 8%+ yield in the US'
      }
    });
    console.log('✅ Asset discovery result:', assetResult);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (mcpClient) {
      console.log('🔌 Closing MCP client...');
      await mcpClient.close();
    }
  }
}

// Run the test
testAgent().catch(console.error);
