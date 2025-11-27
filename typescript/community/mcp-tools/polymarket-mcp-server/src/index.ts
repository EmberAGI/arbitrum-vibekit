#!/usr/bin/env node
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp.js';

async function main() {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.error(`${req.method} ${req.url}`);
    next();
  });

  const funder = process.env.POLYMARKET_FUNDER_ADDRESS;
  const pk = process.env.POLYMARKET_PRIVATE_KEY;
  if (!funder || !pk) {
    console.error('POLYMARKET_FUNDER_ADDRESS and POLYMARKET_PRIVATE_KEY are required');
    process.exit(1);
  }

  const server = await createServer();

  const transports: Record<string, SSEServerTransport> = {};
  app.get('/sse', async (_req: Request, res: Response) => {
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    await server.connect(transport);
  });

  app.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (!transport) {
      res.status(400).send('No transport for sessionId');
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  app.get('/.well-known/agent.json', (_req: Request, res: Response) => {
    res.json({
      name: 'Polymarket MCP Server',
      version: '1.0.0',
      description: 'MCP server for trading on Polymarket via CLOB',
      skills: [
        {
          id: 'polymarket-clob',
          name: 'Polymarket CLOB',
          description: 'Discover markets, inspect orderbooks, and trade on Polymarket',
          tags: ['polymarket', 'clob', 'trading', 'prediction-markets'],
          examples: ['list_markets', 'get_orderbook', 'place_limit_order'],
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
      ],
    });
  });

  const PORT = process.env.PORT || 3020;
  app.listen(PORT, () => console.error(`Polymarket MCP server listening on ${PORT}`));

  const stdioTransport = new StdioServerTransport();
  console.error('Initializing stdio transport...');
  await server.connect(stdioTransport);
  console.error('Polymarket MCP stdio server started.');
  process.stdin.on('end', () => process.exit(0));
}

main().catch(() => process.exit(-1));


