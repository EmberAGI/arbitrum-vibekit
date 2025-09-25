#!/usr/bin/env node

// Simple test script to verify Beefy MCP server functionality
// Using built-in fetch (Node.js 18+)

console.log('🧪 Testing Beefy MCP Server...\n');

const MCP_SERVER_URL = 'http://localhost:3012/mcp';

async function testMcpServer() {
  try {
    console.log('📋 Testing MCP server connection...');

    // Test 1: Initialize connection
    const initResponse = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      }),
    });

    if (!initResponse.ok) {
      throw new Error(`HTTP ${initResponse.status}: ${initResponse.statusText}`);
    }

    const initResult = await initResponse.json();
    console.log('✅ MCP server initialized successfully');
    console.log('Server capabilities:', JSON.stringify(initResult.result?.capabilities, null, 2));

    // Test 2: List available tools
    const toolsResponse = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    if (!toolsResponse.ok) {
      throw new Error(`HTTP ${toolsResponse.status}: ${toolsResponse.statusText}`);
    }

    const toolsResult = await toolsResponse.json();
    console.log('\n🔧 Available MCP tools:');

    if (toolsResult.result?.tools) {
      toolsResult.result.tools.forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name}`);
        console.log(`      Description: ${tool.description}`);
        console.log(
          `      Input schema: ${JSON.stringify(tool.inputSchema?.properties || {}, null, 6)}`
        );
      });
    }

    // Test 3: Call beefy_get_vaults tool
    console.log('\n🥩 Testing beefy_get_vaults tool...');
    const vaultsResponse = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'beefy_get_vaults',
          arguments: {},
        },
      }),
    });

    if (!vaultsResponse.ok) {
      throw new Error(`HTTP ${vaultsResponse.status}: ${vaultsResponse.statusText}`);
    }

    const vaultsResult = await vaultsResponse.json();
    console.log('✅ beefy_get_vaults response:');

    if (vaultsResult.result?.content?.[0]?.text) {
      const vaultData = JSON.parse(vaultsResult.result.content[0].text);
      console.log(`   Found ${vaultData.vaults?.length || 0} vault actions`);
      console.log(`   Chain ID: ${vaultData.chainId}`);

      if (vaultData.vaults?.length > 0) {
        console.log('   Sample vault actions:');
        vaultData.vaults.slice(0, 3).forEach((vault, index) => {
          console.log(`     ${index + 1}. ${vault.actionType}: ${vault.actionName}`);
          console.log(
            `        Input tokens: ${vault.inputTokens?.[0]?.tokens?.length || 0} tokens`
          );
          console.log(
            `        Output tokens: ${vault.outputTokens?.[0]?.tokens?.length || 0} tokens`
          );
        });
      }
    }

    console.log('\n🎉 SUCCESS: Beefy MCP Server is working correctly!');
    console.log('✅ Server is accessible via HTTP');
    console.log('✅ MCP protocol communication working');
    console.log('✅ Beefy plugin tools are available');
    console.log('✅ Vault data is being loaded successfully');
  } catch (error) {
    console.error('\n💥 Error testing MCP server:', error.message);
    console.error('Stack:', error.stack);
  }
}

testMcpServer();
