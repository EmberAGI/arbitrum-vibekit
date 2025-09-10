#!/usr/bin/env node

import { TrendmoonMcpServer } from '@trendmoon/mcp-server';
import { startStandaloneServer } from '@trendmoon/mcp-server/standalone';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import 'dotenv/config';

async function main() {
  // Check if we're running in standalone HTTP mode
  const args = process.argv.slice(2);
  const httpMode = args.includes('--http') || process.env.TRENDMOON_HTTP_MODE === 'true';

  if (httpMode) {
    // Standalone HTTP server mode
    const port = parseInt(process.env.TRENDMOON_HTTP_PORT || '3000', 10);

    console.error(`Starting Trendmoon MCP Server in HTTP mode on port ${port}...`);

    await startStandaloneServer({
      transport: 'http',
      http: { port },
      server: {
        name: process.env.TRENDMOON_SERVER_NAME || 'trendmoon-mcp-server',
        version: '1.0.0'
      }
    });

    console.error(`Trendmoon MCP Server is running on http://localhost:${port}`);
  } else {
    // Standard stdio mode for MCP integration
    console.error('Starting Trendmoon MCP Server in stdio mode...');

    // Create the TrendmoonMcpServer instance
    const mcpServerInstance = new TrendmoonMcpServer({
      name: process.env.TRENDMOON_SERVER_NAME || 'trendmoon-mcp-server',
      version: '1.0.0'
    });

    // Get the MCP server instance
    const server = mcpServerInstance.getMcpServer();

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('Trendmoon MCP Server connected via stdio');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

main().catch((error) => {
  console.error('Failed to start Trendmoon MCP Server:', error);
  process.exit(1);
});
