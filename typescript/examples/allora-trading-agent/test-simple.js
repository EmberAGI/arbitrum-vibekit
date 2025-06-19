#!/usr/bin/env node

/**
 * Simple test script for Allora Trading Agent
 */

const AGENT_URL = 'http://localhost:3008';

// Test queries
const testQueries = [
  {
    name: 'Price Prediction',
    skillId: 'market-forecast',
    input: { message: 'What is the BTC price prediction?' },
  },
  {
    name: 'Trading Analysis',
    skillId: 'trading-analysis',
    input: { message: 'Should I buy ETH with $1000 based on current market conditions?' },
  },
  {
    name: 'Workflow Test',
    skillId: 'trading-analysis',
    input: {
      message:
        'Get ETH prediction and analyze if I should buy with $500. My address is 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD7e',
    },
  },
];

async function testAgent() {
  console.log('🧪 Testing Allora Trading Agent...\n');

  // First check if agent is running
  try {
    const healthCheck = await fetch(`${AGENT_URL}/.well-known/agent.json`);
    if (healthCheck.ok) {
      console.log('✅ Agent is running\n');
    }
  } catch (error) {
    console.error("❌ Agent is not responding. Make sure it's running on port 3008");
    return;
  }

  for (const test of testQueries) {
    console.log(`\n📋 Test: ${test.name}`);
    console.log(`🎯 Skill: ${test.skillId}`);
    console.log(`📝 Query: "${test.input.message}"`);

    try {
      // Use the /messages endpoint with JSON-RPC format
      const response = await fetch(`${AGENT_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'invoke',
          params: {
            skillId: test.skillId,
            input: test.input,
          },
          id: Date.now(),
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error(`\n❌ Error: ${data.error.message}`);
        if (data.error.data) {
          console.error('Details:', JSON.stringify(data.error.data, null, 2));
        }
      } else if (data.result) {
        console.log('\n✅ Response received:');
        console.log('-------------------');

        // Extract the message from the result
        if (data.result.status?.message?.parts?.[0]?.text) {
          console.log(data.result.status.message.parts[0].text);
        } else if (data.result.message) {
          console.log(data.result.message);
        } else {
          console.log(JSON.stringify(data.result, null, 2));
        }

        // Show artifacts if any
        if (data.result.artifacts && data.result.artifacts.length > 0) {
          console.log('\n📦 Artifacts:');
          data.result.artifacts.forEach((artifact, index) => {
            console.log(`\nArtifact ${index + 1}: ${artifact.name}`);
            if (artifact.description) {
              console.log(`Description: ${artifact.description}`);
            }
            // Show artifact content if it's text
            if (artifact.parts?.[0]?.kind === 'text') {
              console.log('Content preview:', artifact.parts[0].text.substring(0, 200) + '...');
            }
          });
        }
      } else {
        console.log('\n📄 Raw response:', JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.error(`\n❌ Request failed: ${error.message}`);
    }

    // Wait between tests
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.log('\n\n✨ Testing complete!');
  console.log('\n💡 Tips:');
  console.log('- Check the agent logs for detailed execution information');
  console.log('- The agent needs MCP servers running (Allora and Ember)');
  console.log('- Make sure your API keys are properly configured in .env');
}

// Run tests
testAgent().catch(console.error);
