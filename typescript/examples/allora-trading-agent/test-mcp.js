#!/usr/bin/env node

/**
 * MCP Test script for Allora Trading Agent
 * Tests agent via MCP SSE endpoint
 */

import { EventSource } from 'eventsource';

const AGENT_URL = 'http://localhost:3008';

// Test queries
const testQueries = [
  {
    name: 'Price Prediction Test',
    message: 'What is the BTC price prediction?',
  },
  {
    name: 'Trading Analysis Test',
    message: 'Should I buy ETH with $1000?',
  },
  {
    name: 'Simple Workflow Test',
    message: 'Get ETH prediction and tell me if I should buy',
  },
];

async function sendMCPRequest(message) {
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${AGENT_URL}/sse`);
    let responseData = '';

    eventSource.onopen = () => {
      console.log('📡 Connected to agent SSE endpoint');

      // Send the message
      const request = {
        jsonrpc: '2.0',
        method: 'invoke',
        params: {
          skillId: 'auto', // Let the agent decide which skill to use
          input: {
            message: message,
          },
        },
        id: Date.now(),
      };

      // For SSE, we typically need to send via a separate POST request
      fetch(`${AGENT_URL}/sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }).catch((err) => {
        console.error('Failed to send request:', err);
      });
    };

    eventSource.onmessage = (event) => {
      responseData += event.data;

      try {
        const data = JSON.parse(event.data);
        if (data.result || data.error) {
          eventSource.close();
          resolve(data);
        }
      } catch (e) {
        // Not complete JSON yet, keep accumulating
      }
    };

    eventSource.onerror = (error) => {
      eventSource.close();
      reject(error);
    };

    // Timeout after 30 seconds
    setTimeout(() => {
      eventSource.close();
      reject(new Error('Request timeout'));
    }, 30000);
  });
}

// Alternative: Use direct HTTP endpoint if available
async function testDirectEndpoint() {
  console.log('\n🔄 Testing direct HTTP endpoint...\n');

  for (const test of testQueries) {
    console.log(`\n📋 Test: ${test.name}`);
    console.log(`📝 Query: "${test.message}"`);

    try {
      // Try the A2A endpoint format
      const response = await fetch(`${AGENT_URL}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'invoke',
          params: {
            input: {
              message: test.message,
            },
          },
          id: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      console.log('\n✅ Response received:');
      console.log('-------------------');
      console.log(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
    }

    // Wait between tests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// Check available endpoints
async function checkEndpoints() {
  console.log('🔍 Checking available endpoints...\n');

  const endpoints = ['/', '/sse', '/.well-known/agent.json', '/health'];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${AGENT_URL}${endpoint}`, {
        method: endpoint === '/' ? 'POST' : 'GET',
        headers: endpoint === '/' ? { 'Content-Type': 'application/json' } : {},
        body: endpoint === '/' ? JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 }) : undefined,
      });

      console.log(`${endpoint}: ${response.status} ${response.statusText}`);
    } catch (error) {
      console.log(`${endpoint}: ❌ ${error.message}`);
    }
  }
}

// Run tests
async function runTests() {
  await checkEndpoints();
  await testDirectEndpoint();
}

runTests().catch(console.error);
