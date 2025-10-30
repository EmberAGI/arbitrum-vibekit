#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

import { createServer } from './mcp.js';

dotenv.config();

async function main() {
  const server = await createServer();

  // Start stdio transport only
  const stdioTransport = new StdioServerTransport();
  console.error('Initializing stdio transport...');
  await server.connect(stdioTransport);
  console.error('CoinGecko MCP stdio server started and connected.');
  console.error('Server is now ready to receive stdio requests.');

  // Exit when stdio is closed (e.g., when parent process ends)
  process.stdin.on('end', () => {
    console.error('Stdio connection closed, exiting...');
    process.exit(0);
  });
}

main().catch(() => process.exit(-1));
