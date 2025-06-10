#!/usr/bin/env node

import { AlloraAPIClient, ChainSlug } from "@alloralabs/allora-sdk";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import express from "express";

import { createServer } from "./mcp.js";


dotenv.config();

async function main() {
  const app = express();

  app.use(function (req, _res, next) {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  const apiKey = process.env.ALLORA_API_KEY || "UP-86455f53320d4ee48a958cc0";
  if (!apiKey) {
    console.error("Error: ALLORA_API_KEY environment variable is required");
    process.exit(1);
  }

  const alloraClient = new AlloraAPIClient({
    chainSlug: ChainSlug.TESTNET,
    apiKey,
  });
  const server = await createServer(alloraClient);

  const transports: { [sessionId: string]: SSEServerTransport } = {};

  app.get("/sse", async (_req, res) => {
    console.log("Received connection");

    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;

    await server.connect(transport);
  });

  app.post("/messages", async (_req, res) => {
    const sessionId = _req.query.sessionId as string;
    console.log(`Received message for session: ${sessionId}`);

    let bodyBuffer = Buffer.alloc(0);

    _req.on("data", (chunk) => {
      bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
    });

    _req.on("end", async () => {
      try {
        // Parse the body
        const bodyStr = bodyBuffer.toString("utf8");
        const bodyObj = JSON.parse(bodyStr);
        console.log(`${JSON.stringify(bodyObj, null, 4)}`);
      } catch (error) {
        console.error(`Error handling request: ${error}`);
      }
    });
    const transport = transports[sessionId];
    if (!transport) {
      res.status(400).send("No transport found for sessionId");
      return;
    }
    await transport.handlePostMessage(_req, res);
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  // Start stdio transport
  const stdioTransport = new StdioServerTransport();
  console.error("Initializing stdio transport...");
  await server.connect(stdioTransport);
  console.error("Allora MCP stdio server started and connected.");
  console.error("Server is now ready to receive stdio requests.");
}

main().catch(() => process.exit(-1));
