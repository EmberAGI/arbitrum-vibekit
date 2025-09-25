#!/usr/bin/env node

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import type { Request, Response, NextFunction } from 'express';

import { createServer } from './mcp.js';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

dotenv.config();

async function main() {
  const app = express();

  // Add CORS middleware
  app.use(cors());

  // Add JSON parsing middleware
  app.use(express.json());

  app.use(function (req: Request, _res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  const server = await createServer();

  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // MCP POST endpoint for StreamableHTTP
  const mcpPostHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (sessionId) {
      console.log(`🥩 Received MCP request for session: ${sessionId}`);
    } else {
      console.log('🥩 Request body:', req.body);
    }

    try {
      let transport: StreamableHTTPServerTransport;
      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: sessionId => {
            console.log(`🥩 Session initialized with ID: ${sessionId}`);
            transports[sessionId] = transport;
          },
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`🥩 Transport closed for session ${sid}, removing from transports map`);
            delete transports[sid];
          }
        };

        // Connect the transport to the MCP server
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Handle the request with existing transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('🥩 Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  };

  app.post('/mcp', mcpPostHandler);

  // Handle GET requests for SSE streams (StreamableHTTP backwards compatibility)
  const mcpGetHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    console.log(`🥩 Establishing SSE stream for session ${sessionId}`);
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  app.get('/mcp', mcpGetHandler);

  // Handle DELETE requests for session termination
  const mcpDeleteHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    console.log(`🥩 Received session termination request for session ${sessionId}`);
    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('🥩 Error handling session termination:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  };

  app.delete('/mcp', mcpDeleteHandler);

  const PORT = process.env.PORT || 3012;
  app.listen(PORT, () => {
    console.log(`🥩 Beefy MCP Server is running on port ${PORT}`);
    console.log(`🥩 MCP endpoint available at http://localhost:${PORT}/mcp`);
  });

  // Start stdio transport
  const stdioTransport = new StdioServerTransport();
  console.error('🥩 Initializing stdio transport...');
  await server.connect(stdioTransport);
  console.error('🥩 Beefy MCP stdio server started and connected.');
  console.error('🥩 Server is now ready to receive stdio requests.');

  // Exit when stdio is closed (e.g., when parent process ends)
  process.stdin.on('end', () => {
    console.error('🥩 Stdio connection closed, exiting...');
    process.exit(0);
  });
}

main().catch(error => {
  console.error('🥩 Failed to start Beefy MCP Server:', error);
  process.exit(-1);
});
