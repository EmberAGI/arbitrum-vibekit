#!/usr/bin/env node

// Comprehensive test script for all Centrifuge MCP tools
import { spawn } from 'child_process';

console.log('🧪 Comprehensive Test: All Centrifuge MCP Tools');
console.log('=' .repeat(60));

const testCases = [
  {
    name: "1. List All Available Tools",
    request: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    },
    expected: "Should show 2 tools: discover-centrifuge-pools and get-investment-status"
  },
  {
    name: "2. Discover All Pools (Basic)",
    request: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "discover-centrifuge-pools",
        arguments: {}
      }
    },
    expected: "Should return 2 pools with detailed information"
  },
  {
    name: "3. Discover Real Estate Pools",
    request: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "discover-centrifuge-pools",
        arguments: {
          assetTypes: ["Real Estate"],
          minYield: 5,
          limit: 5
        }
      }
    },
    expected: "Should return 1 pool (New Silver Pool) with 8.5% yield"
  },
  {
    name: "4. Discover High Yield Pools",
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
    },
    expected: "Should return 1 pool matching high yield and low risk criteria"
  },
  {
    name: "5. Get Investment Status (All Pools)",
    request: {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "get-investment-status",
        arguments: {
          investorAddress: "0x742d35Cc6074C4532895c05b22629ce5b3c28da4"
        }
      }
    },
    expected: "Should return portfolio summary with 2 investments totaling $7,500"
  },
  {
    name: "6. Get Investment Status (Specific Pool)",
    request: {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "get-investment-status",
        arguments: {
          investorAddress: "0x742d35Cc6074C4532895c05b22629ce5b3c28da4",
          poolId: "1",
          includeHistory: true
        }
      }
    },
    expected: "Should return investment details for Pool 1 only"
  },
  {
    name: "7. Get Investment Status (Arbitrum Network)",
    request: {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "get-investment-status",
        arguments: {
          investorAddress: "0x742d35Cc6074C4532895c05b22629ce5b3c28da4",
          network: "arbitrum"
        }
      }
    },
    expected: "Should return investments on Arbitrum network only"
  },
  {
    name: "8. Edge Case: Invalid Address",
    request: {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "get-investment-status",
        arguments: {
          investorAddress: "invalid-address"
        }
      }
    },
    expected: "Should return validation error for invalid address format"
  },
  {
    name: "9. Edge Case: Non-existent Pool Filter",
    request: {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "discover-centrifuge-pools",
        arguments: {
          assetTypes: ["Non-existent"],
          minYield: 50,
          limit: 1
        }
      }
    },
    expected: "Should return empty results with proper messaging"
  },
  {
    name: "11. Analyze Pool Details - Full Analysis",
    request: {
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "analyze-pool-details",
        arguments: {
          poolId: "1",
          includeRiskMetrics: true,
          includeHistoricalData: true,
          includeTrancheDetails: true
        }
      }
    },
    expected: "Should return detailed analysis including risk metrics, historical data, and tranche details"
  },
  {
    name: "12. Analyze Pool Details - Invalid Pool",
    request: {
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: {
        name: "analyze-pool-details",
        arguments: {
          poolId: "999",
          includeRiskMetrics: true
        }
      }
    },
    expected: "Should return error for non-existent pool ID"
  },
  {
    name: "13. Place Investment Order - Valid Senior",
    request: {
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: {
        name: "place-investment-order",
        arguments: {
          investorAddress: "0x742d35Cc6074C4532895c05b22629ce5b3c28da4",
          poolId: "1",
          trancheType: "Senior",
          amount: "2500.00",
          network: "arbitrum",
          slippageTolerance: 2
        }
      }
    },
    expected: "Should successfully place investment order with order details and status"
  },
  {
    name: "14. Place Investment Order - Invalid Address",
    request: {
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: {
        name: "place-investment-order",
        arguments: {
          investorAddress: "invalid-address",
          poolId: "1",
          trancheType: "Senior",
          amount: "1000.00"
        }
      }
    },
    expected: "Should return validation error for invalid Ethereum address"
  },
  {
    name: "15. Place Investment Order - Amount Too Low",
    request: {
      jsonrpc: "2.0",
      id: 15,
      method: "tools/call",
      params: {
        name: "place-investment-order",
        arguments: {
          investorAddress: "0x742d35Cc6074C4532895c05b22629ce5b3c28da4",
          poolId: "1",
          trancheType: "Senior",
          amount: "50.00"
        }
      }
    },
    expected: "Should return validation error for amount below minimum investment"
  },
  {
    name: "16. Place Investment Order - Invalid Tranche",
    request: {
      jsonrpc: "2.0",
      id: 16,
      method: "tools/call",
      params: {
        name: "place-investment-order",
        arguments: {
          investorAddress: "0x742d35Cc6074C4532895c05b22629ce5b3c28da4",
          poolId: "1",
          trancheType: "Invalid",
          amount: "1000.00"
        }
      }
    },
    expected: "Should return error for invalid tranche type"
  },
  {
    name: "17. Edge Case: Unknown Tool",
    request: {
      jsonrpc: "2.0",
      id: 17,
      method: "tools/call",
      params: {
        name: "unknown-tool",
        arguments: {}
      }
    },
    expected: "Should return error for unknown tool"
  }
];

async function runTest(testCase) {
  console.log(`\n🧪 ${testCase.name}`);
  console.log('=' .repeat(50));
  console.log(`📋 Expected: ${testCase.expected}`);
  
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
            
            if (result.error) {
              console.log('❌ Error Response:', result.error.message);
              resolve({ success: false, error: result.error.message });
            } else if (result.result) {
              console.log('✅ Success!');
              
              // Show relevant parts of the response
              if (result.result.tools) {
                console.log(`   Found ${result.result.tools.length} tool(s):`);
                result.result.tools.forEach(tool => {
                  console.log(`   - ${tool.name}`);
                });
              } else if (result.result.content) {
                const content = result.result.content;
                const lines = content.split('\n');
                const summaryLine = lines.find(line => line.includes('SUMMARY:') || line.includes('PORTFOLIO SUMMARY:'));
                if (summaryLine) {
                  console.log(`   ${summaryLine.trim()}`);
                } else {
                  console.log(`   Response preview: ${content.substring(0, 100)}...`);
                }
              }
              
              resolve({ success: true, result });
            } else {
              console.log('❌ No result in response');
              resolve({ success: false, error: 'No result in response' });
            }
          } else {
            console.log('❌ No JSON response found');
            console.log('Output:', output);
            resolve({ success: false, error: 'No JSON response' });
          }
        } catch (error) {
          console.log('❌ Failed to parse response:', error.message);
          resolve({ success: false, error: error.message });
        }
      } else {
        console.log('❌ Process exited with code:', code);
        console.log('Error:', errorOutput);
        resolve({ success: false, error: `Process exited with code ${code}` });
      }
    });

    // Send the request
    child.stdin.write(JSON.stringify(testCase.request) + '\n');
    child.stdin.end();
  });
}

async function runAllTests() {
  console.log('🚀 Starting comprehensive test suite...');
  
  let passed = 0;
  let failed = 0;
  const results = [];

  for (const testCase of testCases) {
    try {
      const result = await runTest(testCase);
      results.push({ test: testCase.name, ...result });
      
      if (result.success) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ Test failed: ${error.message}`);
      results.push({ test: testCase.name, success: false, error: error.message });
      failed++;
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('🏁 TEST RESULTS SUMMARY');
  console.log('=' .repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${testCases.length}`);
  console.log(`🎯 Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`   • ${result.test}: ${result.error}`);
    });
  }

  console.log('\n📋 MCP INSPECTOR SETUP:');
  console.log('1. Open MCP Inspector in your browser');
  console.log('2. Add server with these settings:');
  console.log('   - Command: node');
  console.log('   - Arguments: ["dist/index.js"]');
  console.log('   - Working Directory: ' + process.cwd());
  console.log('3. Test the tools interactively');
  console.log('4. Verify all functionality before proceeding to Phase 2');

  return results;
}

runAllTests().catch(console.error);
