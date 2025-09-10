#!/usr/bin/env node

// Simple script to test the MCP server
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Testing Trendmoon MCP Server...');

// Test in stdio mode
const serverProcess = spawn('node', [join(__dirname, 'dist/index.js')], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, NODE_ENV: 'test' }
});

// Send basic MCP request
const mcpRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {}
};

serverProcess.stdin.write(JSON.stringify(mcpRequest) + '\n');

serverProcess.stdout.on('data', (data) => {
  try {
    const response = JSON.parse(data.toString());
    console.log('✅ Server response:', JSON.stringify(response, null, 2));
    process.exit(0);
  } catch (error) {
    console.log('📝 Server output:', data.toString());
  }
});

serverProcess.on('error', (error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏱️  Test timeout');
  serverProcess.kill();
  process.exit(1);
}, 10000);
