#!/usr/bin/env node

/**
 * Manual Testing Script for CoinGecko MCP Server Integration
 * 
 * This script helps you manually test the MCP server integration
 * without running the full web client.
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

class McpServerTester {
  constructor() {
    this.serverProcess = null;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      logInfo('Starting CoinGecko MCP Server...');
      
      this.serverProcess = spawn('node', [
        path.join(__dirname, '../../lib/mcp-tools/coingecko-mcp-server/dist/index.js')
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let serverReady = false;

      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output.includes('CoinGecko MCP stdio server started and connected')) {
          serverReady = true;
          logSuccess('MCP Server started successfully!');
          resolve();
        } else if (output.includes('CoinGecko MCP Server is running on port 3002')) {
          logInfo('HTTP server is running on port 3002');
        }
      });

      this.serverProcess.on('error', (error) => {
        logError(`Failed to start server: ${error.message}`);
        reject(error);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!serverReady) {
          this.serverProcess.kill();
          reject(new Error('Server failed to start within 10 seconds'));
        }
      }, 10000);
    });
  }

  async testDirectConnection() {
    logInfo('Testing direct MCP connection...');
    
    return new Promise((resolve, reject) => {
      const testRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_supported_tokens',
          arguments: {}
        }
      };

      const requestStr = JSON.stringify(testRequest) + '\n';
      this.serverProcess.stdin.write(requestStr);

      const timeout = setTimeout(() => {
        reject(new Error('Direct connection test timeout'));
      }, 5000);

      this.serverProcess.stdout.once('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString().trim());
          if (response.result && response.result.content) {
            const tokens = JSON.parse(response.result.content[0].text);
            logSuccess(`Direct connection test passed! Found ${tokens.count} supported tokens`);
            resolve(response);
          } else {
            reject(new Error('Invalid response format'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async testChartGeneration() {
    logInfo('Testing chart generation...');
    
    return new Promise((resolve, reject) => {
      const testRequest = {
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
      };

      const requestStr = JSON.stringify(testRequest) + '\n';
      this.serverProcess.stdin.write(requestStr);

      const timeout = setTimeout(() => {
        reject(new Error('Chart generation test timeout'));
      }, 10000);

      this.serverProcess.stdout.once('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString().trim());
          if (response.result && response.result.content) {
            const chartData = JSON.parse(response.result.content[0].text);
            if (chartData.prices && chartData.prices.length > 0) {
              logSuccess(`Chart generation test passed! Generated chart with ${chartData.prices.length} data points`);
              resolve(response);
            } else {
              reject(new Error('Chart data is empty'));
            }
          } else {
            reject(new Error('Invalid response format'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async testInvalidToken() {
    logInfo('Testing invalid token handling...');
    
    return new Promise((resolve, reject) => {
      const testRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'generate_chart',
          arguments: {
            token: 'INVALIDTOKEN',
            days: 7
          }
        }
      };

      const requestStr = JSON.stringify(testRequest) + '\n';
      this.serverProcess.stdin.write(requestStr);

      const timeout = setTimeout(() => {
        reject(new Error('Invalid token test timeout'));
      }, 5000);

      this.serverProcess.stdout.once('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString().trim());
          if (response.result && response.result.content) {
            const errorData = JSON.parse(response.result.content[0].text);
            if (errorData.error && errorData.error.includes('not supported')) {
              logSuccess('Invalid token test passed! Correctly handled unsupported token');
              resolve(response);
            } else {
              reject(new Error('Did not handle invalid token correctly'));
            }
          } else {
            reject(new Error('Invalid response format'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async testHttpEndpoint() {
    logInfo('Testing HTTP endpoint...');
    
    try {
      const response = await fetch('http://localhost:3002/sse', {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        logSuccess('HTTP endpoint test passed! Server is accessible via HTTP');
        return true;
      } else {
        throw new Error(`HTTP request failed with status ${response.status}`);
      }
    } catch (error) {
      logWarning(`HTTP endpoint test failed: ${error.message}`);
      return false;
    }
  }

  async runAllTests() {
    try {
      await this.startServer();
      
      // Run tests
      await this.testDirectConnection();
      await this.testChartGeneration();
      await this.testInvalidToken();
      await this.testHttpEndpoint();
      
      logSuccess('All tests passed! 🎉');
      logInfo('The CoinGecko MCP server is working correctly.');
      logInfo('You can now integrate it with your web client.');
      
    } catch (error) {
      logError(`Test failed: ${error.message}`);
      process.exit(1);
    }
  }

  async interactiveMode() {
    logInfo('Starting interactive testing mode...');
    logInfo('Available commands:');
    logInfo('  test - Run all tests');
    logInfo('  chart <token> <days> - Generate a chart');
    logInfo('  tokens - Get supported tokens');
    logInfo('  http - Test HTTP endpoint');
    logInfo('  quit - Exit');

    const askQuestion = (question) => {
      return new Promise((resolve) => {
        this.rl.question(question, resolve);
      });
    };

    while (true) {
      const command = await askQuestion('\nEnter command: ');
      const parts = command.trim().split(' ');

      try {
        switch (parts[0].toLowerCase()) {
          case 'test':
            await this.runAllTests();
            break;
            
          case 'chart':
            if (parts.length < 3) {
              logError('Usage: chart <token> <days>');
              break;
            }
            await this.generateChart(parts[1], parseInt(parts[2]));
            break;
            
          case 'tokens':
            await this.getSupportedTokens();
            break;
            
          case 'http':
            await this.testHttpEndpoint();
            break;
            
          case 'quit':
          case 'exit':
            logInfo('Goodbye!');
            this.cleanup();
            process.exit(0);
            break;
            
          default:
            logError('Unknown command. Type "quit" to exit.');
        }
      } catch (error) {
        logError(`Command failed: ${error.message}`);
      }
    }
  }

  async generateChart(token, days) {
    logInfo(`Generating chart for ${token} over ${days} days...`);
    
    return new Promise((resolve, reject) => {
      const testRequest = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'generate_chart',
          arguments: { token, days }
        }
      };

      const requestStr = JSON.stringify(testRequest) + '\n';
      this.serverProcess.stdin.write(requestStr);

      const timeout = setTimeout(() => {
        reject(new Error('Chart generation timeout'));
      }, 10000);

      this.serverProcess.stdout.once('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString().trim());
          if (response.result && response.result.content) {
            const chartData = JSON.parse(response.result.content[0].text);
            if (chartData.prices) {
              logSuccess(`Chart generated with ${chartData.prices.length} data points`);
              console.log('Chart data:', JSON.stringify(chartData, null, 2));
            } else if (chartData.error) {
              logError(`Chart generation failed: ${chartData.error}`);
            }
            resolve(response);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async getSupportedTokens() {
    logInfo('Getting supported tokens...');
    
    return new Promise((resolve, reject) => {
      const testRequest = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'get_supported_tokens',
          arguments: {}
        }
      };

      const requestStr = JSON.stringify(testRequest) + '\n';
      this.serverProcess.stdin.write(requestStr);

      const timeout = setTimeout(() => {
        reject(new Error('Get tokens timeout'));
      }, 5000);

      this.serverProcess.stdout.once('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString().trim());
          if (response.result && response.result.content) {
            const tokens = JSON.parse(response.result.content[0].text);
            logSuccess(`Found ${tokens.count} supported tokens:`);
            tokens.supportedTokens.forEach(token => {
              console.log(`  - ${token.symbol} (${token.name})`);
            });
            resolve(response);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  cleanup() {
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    if (this.rl) {
      this.rl.close();
    }
  }
}

// Main execution
async function main() {
  const tester = new McpServerTester();
  
  // Handle cleanup on exit
  process.on('SIGINT', () => {
    logInfo('Shutting down...');
    tester.cleanup();
    process.exit(0);
  });

  const args = process.argv.slice(2);
  
  if (args.includes('--interactive') || args.includes('-i')) {
    await tester.interactiveMode();
  } else {
    await tester.runAllTests();
    tester.cleanup();
  }
}

// Run the script
main().catch(error => {
  logError(`Script failed: ${error.message}`);
  process.exit(1);
}); 