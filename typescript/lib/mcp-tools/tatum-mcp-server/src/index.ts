#!/usr/bin/env node
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp.js';

dotenv.config();

async function main() {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.error(`${req.method} ${req.url}`);
    next();
  });

  const tatumApiKey = process.env.TATUM_API_KEY;
  if (!tatumApiKey) {
    console.error('TATUM_API_KEY is required');
    process.exit(1);
  }
  const chain = process.env.TATUM_CHAIN || 'arbitrum-one-mainnet';

  const server = await createServer({ tatumApiKey, chain });

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
      name: 'Tatum MCP Server',
      version: '1.0.0',
      description: 'MCP server proxying Tatum Gateway for Arbitrum data',
      skills: [
        {
          id: 'tatum-gateway',
          name: 'Tatum Gateway',
          description: 'Chain data access via allow-listed JSON-RPC',
          tags: ['rpc', 'arbitrum', 'tatum'],
          examples: ['get_block_number', 'get_native_balance'],
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
      ],
    });
  });

  const PORT = process.env.PORT || 3010;
  app.listen(PORT, () => console.error(`Tatum MCP server listening on ${PORT}`));

  const stdioTransport = new StdioServerTransport();
  console.error('Initializing stdio transport...');
  await server.connect(stdioTransport);
  console.error('Tatum MCP stdio server started.');
  process.stdin.on('end', () => process.exit(0));
}

main().catch(() => process.exit(-1));


