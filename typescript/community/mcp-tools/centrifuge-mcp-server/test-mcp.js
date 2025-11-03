#!/usr/bin/env node

import { spawn } from 'child_process';

// Test the MCP server with different scenarios
const testCases = [
  {
    name: "List Tools",
    request: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    }
  },
  {
    name: "Discover Real Estate Pools",
    request: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "discover-centrifuge-pools",
        arguments: {
          assetTypes: ["Real Estate"],
          minYield: 5,
          limit: 5
        }
      }
    }
  },
  {
    name: "Discover All Pools",
    request: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "discover-centrifuge-pools",
        arguments: {
          limit: 10
        }
      }
    }
  },
  {
    name: "Discover High Yield Pools",
    request: {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "discover-centrifuge-pools",
        arguments: {
          minYield: 8,
          maxRisk: 70,
          limit: 3
        }
      }
    }
  },
  {
    name: "Analyze Pool Details",
    request: {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "analyze-pool-details",
        arguments: {
          poolId: "1",
          includeRiskMetrics: true,
          includeHistoricalData: false
        }
      }
    }
  },
  {
    name: "Place Investment Order",
    request: {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "place-investment-order",
        arguments: {
          investorAddress: "0x742d35Cc6074C4532895c05b22629ce5b3c28da4",
          poolId: "1",
          trancheType: "Senior",
          amount: "1000.50",
          network: "arbitrum"
        }
      }
    }
  }
];

async function runTest(testCase) {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log('=' .repeat(50));
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        try {
          const lines = output.split('\n');
          const jsonLine = lines.find(line => line.startsWith('{'));
          if (jsonLine) {
            const result = JSON.parse(jsonLine);
            console.log('✅ Success!');
            console.log('Response:', JSON.stringify(result, null, 2));
            resolve(result);
          } else {
            console.log('❌ No JSON response found');
            console.log('Output:', output);
            reject(new Error('No JSON response'));
          }
        } catch (error) {
          console.log('❌ Failed to parse response:', error.message);
          console.log('Output:', output);
          reject(error);
        }
      } else {
        console.log('❌ Process exited with code:', code);
        console.log('Error:', errorOutput);
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    // Send the request
    child.stdin.write(JSON.stringify(testCase.request) + '\n');
    child.stdin.end();
  });
}

async function runAllTests() {
  console.log('🚀 Starting Centrifuge MCP Server Tests');
  console.log('=' .repeat(60));

  for (const testCase of testCases) {
    try {
      await runTest(testCase);
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
    }
  }

  console.log('\n🏁 All tests completed!');
}

runAllTests().catch(console.error);
