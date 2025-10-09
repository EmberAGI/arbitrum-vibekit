#!/usr/bin/env node

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { Hono } from 'hono';
import { createServer as createNodeServer } from 'node:http';
import { createServer } from './mcp.js';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  findPregenWallet,
  listPregenWallets,
  findPregenWalletByAddress,
  setPregenWalletClaimStatus,
} from './store/pregenWalletStore.js';

dotenv.config();

async function main() {
  const app = new Hono();
  const server = await createServer();

  // Simple request logger
  app.use('*', async (c, next) => {
    console.log(`${c.req.method} ${c.req.url}`);
    await next();
  });

  // GET /api/pregen-wallets - List pregenerated wallets from in-memory store
  app.get('/api/pregen-wallets', async (c) => {
    try {
      const data = listPregenWallets();
      return c.json({ ok: true, data }, 200);
    } catch (err: any) {
      console.error('Error listing pregenerated wallets:', err);
      return c.json(
        { ok: false, error: 'ServerError', message: err?.message || String(err) },
        500,
      );
    }
  });

  // GET /api/pregen-wallet/by-identifier - Fetch single pregenerated wallet by email or address
  app.get('/api/pregen-wallet/by-identifier', async (c) => {
    try {
      const email = c.req.query('email');
      const address = c.req.query('address');

      if (!address && !email) {
        return c.json(
          {
            ok: false,
            error: 'ValidationError',
            message: 'Provide either address or email',
          },
          400,
        );
      }

      let entry = address ? findPregenWalletByAddress(address) : undefined;
      if (!entry && email) {
        entry = findPregenWallet(email);
      }
      if (!entry) {
        return c.json(
          {
            ok: false,
            error: 'NotFound',
            message: address
              ? `No pregenerated wallet found for address ${address}`
              : `No pregenerated wallet found for email:${email}`,
          },
          404,
        );
      }

      // Return safe subset including userShareJson
      const data = {
        recordId: entry.recordId,
        walletId: entry.walletId,
        address: entry.address,
        email: entry.email,
        userShareJson: entry.userShareJson,
        createdAt: entry.createdAt,
        recoverySecret: entry.recoverySecret,
        lastUsedAt: entry.lastUsedAt,
        isClaimed: entry.isClaimed,
      };
      return c.json({ ok: true, data }, 200);
    } catch (err: any) {
      console.error('Error fetching pregenerated wallet by identifier:', err);
      return c.json(
        { ok: false, error: 'ServerError', message: err?.message || String(err) },
        500,
      );
    }
  });

  // POST /api/pregen-wallet/mark-claimed - Update claim status by address or email
  app.post('/api/pregen-wallet/mark-claimed', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        email?: string;
        address?: string;
        isClaimed?: boolean;
        recoverySecret?: string;
      };

      const { email, address, recoverySecret } = body;
      const isClaimed = body.isClaimed ?? true;

      if (!address && !email) {
        return c.json(
          {
            ok: false,
            error: 'ValidationError',
            message: 'Provide either address or email',
          },
          400,
        );
      }

      const updated = setPregenWalletClaimStatus({
        address,
        email,
        isClaimed,
        recoverySecret,
      });
      if (!updated) {
        return c.json(
          {
            ok: false,
            error: 'NotFound',
            message: 'Pregenerated wallet not found for provided parameters',
          },
          404,
        );
      }
      return c.json({ ok: true, data: updated }, 200);
    } catch (err: any) {
      console.error('Error updating claim status:', err);
      return c.json(
        { ok: false, error: 'ServerError', message: err?.message || String(err) },
        500,
      );
    }
  });

  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // POST /mcp - StreamableHTTP JSON-RPC endpoint
  app.post('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');
    if (sessionId) {
      console.log(`Received MCP request for session: ${sessionId}`);
    }

    try {
      let transport: StreamableHTTPServerTransport;
      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else {
        // Read body only if needed to check initialize request
        const body = await c.req.json().catch(() => undefined);
        if (body && isInitializeRequest(body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              console.log(`Session initialized with ID: ${sid}`);
              transports[sid] = transport;
            },
          });

          // Clean up on close
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              console.log(`Transport closed for session ${sid}, removing from transports map`);
              delete transports[sid];
            }
          };

          await server.connect(transport);
          // Delegate whole request handling to transport (Fetch API style)
          const resp = await transport.handleRequest(c.req.raw, undefined, body as any);
          return resp as Response;
        } else {
          return c.json(
            {
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
              id: null,
            },
            400,
          );
        }
      }

      // Existing transport: delegate handling
      const resp = await transport.handleRequest(c.req.raw);
      return resp as Response;
    } catch (error) {
      console.error('Error handling MCP request:', error);
      return c.json(
        {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        },
        500,
      );
    }
  });

  // GET /mcp - SSE stream bridge for StreamableHTTP
  app.get('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');
    if (!sessionId || !transports[sessionId]) {
      return c.text('Invalid or missing session ID', 400);
    }
    console.log(`Establishing SSE stream for session ${sessionId}`);
    const transport = transports[sessionId];
    const resp = await transport.handleRequest(c.req.raw);
    return resp as Response;
  });

  // DELETE /mcp - Session termination
  app.delete('/mcp', async (c) => {
    const sessionId = c.req.header('mcp-session-id');
    if (!sessionId || !transports[sessionId]) {
      return c.text('Invalid or missing session ID', 400);
    }
    console.log(`Received session termination request for session ${sessionId}`);
    try {
      const transport = transports[sessionId];
      const resp = await transport.handleRequest(c.req.raw);
      return resp as Response;
    } catch (error) {
      console.error('Error handling session termination:', error);
      return c.text('Error processing session termination', 500);
    }
  });

  // Create a Node HTTP server that routes /mcp to the MCP transport and
  // delegates all other paths to the Hono app via Fetch API.
  const nodeServer = createNodeServer(async (req, res) => {
    try {
      const host = req.headers.host || 'localhost';
      const url = new URL(req.url || '/', `http://${host}`);

      // Basic request logging
      console.log(`${req.method} ${url.pathname}`);

      if (url.pathname === '/mcp') {
        const sessionId = (req.headers['mcp-session-id'] as string) || undefined;

        let transport: StreamableHTTPServerTransport;
        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
          await transport.handleRequest(req, res);
          return;
        }

        if (req.method === 'POST') {
          // Read body for initialize request check
          const bodyStr = await new Promise<string>((resolve) => {
            let data = '';
            req.on('data', (chunk) => (data += chunk));
            req.on('end', () => resolve(data));
            req.on('error', () => resolve(''));
          });

          let body: any;
          try {
            body = bodyStr ? JSON.parse(bodyStr) : undefined;
          } catch {
            body = undefined;
          }

          if (body && isInitializeRequest(body)) {
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sid) => {
                console.log(`Session initialized with ID: ${sid}`);
                transports[sid] = transport;
              },
            });

            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid && transports[sid]) {
                console.log(`Transport closed for session ${sid}, removing from transports map`);
                delete transports[sid];
              }
            };

            await server.connect(transport);
            await transport.handleRequest(req, res, body);
            return;
          }

          // Not an initialize request and no session to reuse
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
              id: null,
            }),
          );
          return;
        }

        // For GET/DELETE without a valid session
        res.statusCode = 400;
        res.end('Invalid or missing session ID');
        return;
      }

      // Fallback to Hono app for non-MCP routes
      // Convert Node IncomingMessage to WHATWG Request for Hono
      const init: any = {
        method: req.method,
        headers: req.headers as any,
      };
      if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = req as any; // stream body
      }
      // Node streams require duplex flag for fetch in Node.js
      init.duplex = 'half';
      const request = new Request(url.toString(), init);

      const resp = await app.fetch(request);
      res.statusCode = resp.status;
      resp.headers.forEach((value, key) => res.setHeader(key, value));
      const ab = await resp.arrayBuffer();
      res.end(Buffer.from(ab));
    } catch (error) {
      console.error('HTTP server error:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal server error');
      }
    }
  });

  const PORT = Number(process.env.PORT || 3012);
  nodeServer.listen(PORT, () => {
    console.log(`Para MCP Server (Hono + Node) is running on port ${PORT}`);
    console.log(`MCP endpoint available at http://localhost:${PORT}/mcp`);
  });

  // Optional: Start stdio transport for local tools/inspector if enabled
  const enableStdio = process.env.MCP_STDIO_ENABLED === 'true';
  if (enableStdio) {
    const stdioTransport = new StdioServerTransport();
    console.error('Initializing stdio transport...');
    await server.connect(stdioTransport);
    console.error('Para MCP stdio server started and connected.');
    console.error('Server is now ready to receive stdio requests.');

    process.stdin.on('end', () => {
      console.error('Stdio connection closed, exiting...');
      process.exit(0);
    });
  } else {
    console.error('MCP stdio transport disabled (set MCP_STDIO_ENABLED=true to enable).');
  }
}

main().catch(() => process.exit(-1));
