#!/usr/bin/env node

import fetch from 'node-fetch';
import { EventSource } from 'eventsource';

const MCP_ENDPOINT = 'http://localhost:3001/mcp';

async function testCentrifugeMCP() {
  console.log('🚀 Testing Centrifuge MCP Server via HTTP/SSE...\n');

  try {
    // Step 1: Initialize
    console.log('1️⃣ Initializing MCP connection...');
    const initResponse = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      })
    });

    const initText = await initResponse.text();
    console.log('Init response:', initText);

    // Extract session ID from SSE response
    const sessionIdMatch = initText.match(/"sessionId":"([^"]+)"/);
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

    if (!sessionId) {
      console.error('❌ Could not extract session ID from response');
      return;
    }

    console.log(`✅ Session ID: ${sessionId}\n`);

    // Step 2: List tools
    console.log('2️⃣ Listing available tools...');
    const toolsResponse = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    });

    const toolsText = await toolsResponse.text();
    console.log('Tools response:', toolsText);

    // Step 3: Test pool discovery
    console.log('\n3️⃣ Testing pool discovery...');
    const poolResponse = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'discover-centrifuge-pools',
          arguments: {}
        }
      })
    });

    const poolText = await poolResponse.text();
    console.log('Pool discovery response:', poolText);

    console.log('\n✅ MCP Server test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testCentrifugeMCP();
