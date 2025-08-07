#!/usr/bin/env node

// Simple test script for the CoinGecko MCP server
// This script tests the stdio transport directly

const { spawn } = require('child_process');
const path = require('path');

async function testMcpServer() {
  console.log('🧪 Testing CoinGecko MCP Server...\n');

  // Start the MCP server
  const serverProcess = spawn('node', [path.join(__dirname, 'dist/index.js')], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let serverReady = false;
  let testResults = [];

  // Listen for server output
  serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    console.log('Server:', output.trim());
    
    if (output.includes('CoinGecko MCP stdio server started and connected')) {
      serverReady = true;
      console.log('✅ Server is ready!\n');
      runTests();
    }
  });

  // Listen for server errors
  serverProcess.on('error', (error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
  });

  async function runTests() {
    try {
      // Test 1: Get supported tokens
      console.log('📋 Test 1: Getting supported tokens...');
      const tokensResult = await sendMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_supported_tokens',
          arguments: {}
        }
      });
      
      if (tokensResult.result) {
        const tokens = JSON.parse(tokensResult.result.content[0].text);
        console.log(`✅ Found ${tokens.count} supported tokens`);
        testResults.push('get_supported_tokens: PASS');
      } else {
        console.log('❌ Failed to get supported tokens');
        testResults.push('get_supported_tokens: FAIL');
      }

      // Test 2: Generate chart for BTC
      console.log('\n📊 Test 2: Generating BTC price chart...');
      const chartResult = await sendMcpRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'generate_chart',
          arguments: {
            token: 'BTC',
            days: 7
          }
        }
      });
      
      if (chartResult.result) {
        const chartData = JSON.parse(chartResult.result.content[0].text);
        if (chartData.prices && chartData.prices.length > 0) {
          console.log(`✅ Generated chart with ${chartData.prices.length} data points`);
          testResults.push('generate_chart: PASS');
        } else {
          console.log('❌ Chart data is empty');
          testResults.push('generate_chart: FAIL');
        }
      } else {
        console.log('❌ Failed to generate chart');
        testResults.push('generate_chart: FAIL');
      }

      // Test 3: Test invalid token
      console.log('\n🚫 Test 3: Testing invalid token...');
      const invalidResult = await sendMcpRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'generate_chart',
          arguments: {
            token: 'INVALID',
            days: 7
          }
        }
      });
      
      if (invalidResult.result) {
        const errorData = JSON.parse(invalidResult.result.content[0].text);
        if (errorData.error && errorData.error.includes('not supported')) {
          console.log('✅ Correctly handled invalid token');
          testResults.push('invalid_token: PASS');
        } else {
          console.log('❌ Did not handle invalid token correctly');
          testResults.push('invalid_token: FAIL');
        }
      } else {
        console.log('❌ Failed to test invalid token');
        testResults.push('invalid_token: FAIL');
      }

      // Print test summary
      console.log('\n📊 Test Summary:');
      testResults.forEach(result => {
        const [test, status] = result.split(': ');
        console.log(`${status === 'PASS' ? '✅' : '❌'} ${test}`);
      });

      const passedTests = testResults.filter(r => r.includes('PASS')).length;
      const totalTests = testResults.length;
      console.log(`\n🎯 Results: ${passedTests}/${totalTests} tests passed`);

    } catch (error) {
      console.error('❌ Test error:', error);
    } finally {
      // Clean up
      serverProcess.kill();
      process.exit(0);
    }
  }

  async function sendMcpRequest(request) {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      
      // Send request to server
      serverProcess.stdin.write(requestStr);
      
      // Listen for response
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 10000);

      serverProcess.stdout.once('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString().trim());
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Handle process cleanup
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    serverProcess.kill();
    process.exit(0);
  });
}

// Run the test
testMcpServer().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
}); 