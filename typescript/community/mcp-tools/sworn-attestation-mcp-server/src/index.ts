#!/usr/bin/env node

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./mcp.js";

dotenv.config();

const transport_mode = process.env.TRANSPORT_MODE ?? "http";

async function main() {
  if (transport_mode === "stdio") {
    // Stdio transport for local MCP clients (Claude Desktop, etc.)
    const server = await createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[SWORN MCP] Running in stdio mode");
    return;
  }

  // HTTP transport (default)
  const app = express();
  app.use(express.json());

  app.use(function (req: Request, _res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  const server = await createServer();
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      server: "sworn-attestation-mcp-server",
      version: "1.0.0",
      relay_url: process.env.SWORN_RELAY_URL ?? "https://sworn-pact-relay.chitacloud.dev",
    });
  });

  const mcpPostHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string;
    try {
      let transport: StreamableHTTPServerTransport;
      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.log(`Session initialized: ${sid}`);
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
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        });
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };

  app.post("/mcp", mcpPostHandler);
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string;
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].close();
      delete transports[sessionId];
      res.status(200).send("Session terminated");
    } else {
      res.status(404).send("Session not found");
    }
  });
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string;
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res);
    } else {
      res.status(400).send("Invalid or missing session ID");
    }
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.log(`[SWORN MCP] HTTP server listening on port ${port}`);
    console.log(`[SWORN MCP] Relay URL: ${process.env.SWORN_RELAY_URL ?? "https://sworn-pact-relay.chitacloud.dev"}`);
  });
}

main().catch((error) => {
  console.error("[SWORN MCP] Fatal error:", error);
  process.exit(1);
});