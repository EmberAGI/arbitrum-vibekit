#!/usr/bin/env node

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

import { createServer } from './mcp.js';

dotenv.config();

async function main() {
  const app = express();

  app.use(function (req: Request, _res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  const server = await createServer();

  const transports: { [sessionId: string]: SSEServerTransport } = {};

  app.get('/sse', async (_req: Request, res: Response) => {
    console.log('Received connection');

    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;

    await server.connect(transport);
  });

  app.post('/messages', async (_req: Request, res: Response) => {
    const sessionId = _req.query.sessionId as string;
    console.log(`Received message for session: ${sessionId}`);

    let bodyBuffer = Buffer.alloc(0);

    _req.on('data', chunk => {
      bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
    });

    _req.on('end', async () => {
      try {
        // Parse the body
        const bodyStr = bodyBuffer.toString('utf8');
        const bodyObj = JSON.parse(bodyStr);
        console.log(`${JSON.stringify(bodyObj, null, 4)}`);
      } catch (error) {
        console.error(`Error handling request: ${error}`);
      }
    });
    const transport = transports[sessionId];
    if (!transport) {
      res.status(400).send('No transport found for sessionId');
      return;
    }
    await transport.handlePostMessage(_req, res);
  });

  const PORT = process.env.PORT || 3011;
  app.listen(PORT, () => {
    console.log(`CoinGecko MCP Server is running on port ${PORT}`);
  });

  // Start stdio transport
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
