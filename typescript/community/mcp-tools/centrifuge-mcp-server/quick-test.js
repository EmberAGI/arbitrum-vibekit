#!/usr/bin/env node

// Quick test script to verify MCP server is working
import { spawn } from 'child_process';

console.log('🧪 Quick Test: Centrifuge MCP Server');
console.log('=' .repeat(50));

// Test 1: List tools
console.log('\n1️⃣ Testing: List Tools');
const test1 = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] });

test1.stdin.write(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {}
}) + '\n');

test1.stdin.end();

let output1 = '';
test1.stdout.on('data', (data) => {
  output1 += data.toString();
});

test1.on('close', (code) => {
  if (code === 0) {
    try {
      const lines = output1.split('\n');
      const jsonLine = lines.find(line => line.startsWith('{'));
      if (jsonLine) {
        const result = JSON.parse(jsonLine);
        if (result.result && result.result.tools && result.result.tools.length > 0) {
          console.log('✅ Tools listed successfully');
          console.log(`   Found ${result.result.tools.length} tool(s):`);
          result.result.tools.forEach(tool => {
            console.log(`   - ${tool.name}: ${tool.description}`);
          });
        } else {
          console.log('❌ No tools found in response');
        }
      } else {
        console.log('❌ No JSON response found');
      }
    } catch (error) {
      console.log('❌ Failed to parse response:', error.message);
    }
  } else {
    console.log('❌ Process exited with code:', code);
  }

  // Test 2: Call discover-centrifuge-pools
  console.log('\n2️⃣ Testing: Discover Centrifuge Pools');
  const test2 = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] });

  test2.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "discover-centrifuge-pools",
      arguments: {
        assetTypes: ["Real Estate"],
        minYield: 5,
        limit: 3
      }
    }
  }) + '\n');

  test2.stdin.end();

  let output2 = '';
  test2.stdout.on('data', (data) => {
    output2 += data.toString();
  });

  test2.on('close', (code) => {
    if (code === 0) {
      try {
        const lines = output2.split('\n');
        const jsonLine = lines.find(line => line.startsWith('{'));
        if (jsonLine) {
          const result = JSON.parse(jsonLine);
          if (result.result && result.result.content) {
            console.log('✅ Pool discovery successful');
            console.log('   Response preview:', result.result.content.substring(0, 100) + '...');
          } else {
            console.log('❌ No content in response');
          }
        } else {
          console.log('❌ No JSON response found');
        }
      } catch (error) {
        console.log('❌ Failed to parse response:', error.message);
      }
    } else {
      console.log('❌ Process exited with code:', code);
    }

    console.log('\n🎉 Quick test completed!');
    console.log('\n📋 Next Steps:');
    console.log('1. Open MCP Inspector in your browser');
    console.log('2. Connect to the server using the configuration');
    console.log('3. Run the comprehensive test cases from MCP_INSPECTOR_TEST_GUIDE.md');
    console.log('4. Verify all functionality before proceeding to Phase 2');
  });
});
