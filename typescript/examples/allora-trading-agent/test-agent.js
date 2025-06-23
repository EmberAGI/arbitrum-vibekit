#!/usr/bin/env node

/**
 * Test script for Allora Trading Agent
 * Tests various agent capabilities via HTTP requests
 */

const AGENT_URL = 'http://localhost:3008';

// Test queries
const testQueries = [
  {
    name: 'Price Prediction Test',
    message: 'What is the BTC price prediction for the next 24 hours?',
  },
  {
    name: 'Trading Analysis Test',
    message: 'Should I buy ETH with $1000 based on current predictions?',
  },
  {
    name: 'Workflow Test',
    message: 'Get ETH prediction and analyze if I should buy with $500',
    context: {
      userAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD7e', // Example address
      portfolioValue: 10000,
    },
  },
  {
    name: 'Trade Execution Test',
    message: 'Buy 100 USDC worth of ETH on Arbitrum',
    context: {
      userAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD7e', // Example address
    },
  },
];

async function testAgent() {
  console.log('🧪 Testing Allora Trading Agent...\n');

  for (const test of testQueries) {
    console.log(`\n📋 Test: ${test.name}`);
    console.log(`📝 Query: "${test.message}"`);

    try {
      const response = await fetch(`${AGENT_URL}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: test.message,
          context: test.context || {},
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      console.log('\n✅ Response received:');
      console.log('-------------------');

      // Extract and display the message from the response
      if (data.status?.message?.parts?.[0]?.text) {
        console.log(data.status.message.parts[0].text);
      } else if (data.message) {
        console.log(data.message);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }

      // Show artifacts if any
      if (data.artifacts && data.artifacts.length > 0) {
        console.log('\n📦 Artifacts:');
        data.artifacts.forEach((artifact, index) => {
          console.log(`\nArtifact ${index + 1}: ${artifact.name}`);
          if (artifact.description) {
            console.log(`Description: ${artifact.description}`);
          }
        });
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
    }

    // Wait a bit between tests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log('\n\n✨ Testing complete!');
}

// Run tests
testAgent().catch(console.error);
