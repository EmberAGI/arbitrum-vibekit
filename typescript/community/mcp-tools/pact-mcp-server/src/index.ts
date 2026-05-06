#!/usr/bin/env node

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { createServer } from './mcp.js';

dotenv.config();

async function main() {
  const app = express();
  app.use(express.json());
  app.use(function (req: Request, _res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  const server = await createServer();
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const mcpPostHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport;
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('Error handling MCP request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  };

  app.post('/mcp', mcpPostHandler);

  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (err) {
      console.error('Error handling session termination:', err);
      if (!res.headersSent) res.status(500).send('Error processing session termination');
    }
  });

  const PORT = process.env['PORT'] ?? '3012';
  app.listen(Number(PORT), () => {
    console.log(`PACT MCP Server running on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Arbitrum RPC: ${process.env['ARBITRUM_RPC_URL'] ?? 'https://arb1.arbitrum.io/rpc'}`);
  });

  // Also start stdio transport for Claude Desktop / local agent use
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);

  process.stdin.on('end', () => {
    process.exit(0);
  });

  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

main().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(-1);
});
