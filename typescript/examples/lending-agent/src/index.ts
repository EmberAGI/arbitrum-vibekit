import { Agent } from "./agent.js";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import cors from "cors";
import { z } from "zod";

dotenv.config();

// Initialize the MCP server
const server = new McpServer({
  name: "mcp-sse-agent-server",
  version: "1.0.0",
});

// RPC and EMBER endpoint setup
const rpc = process.env.RPC_URL || "https://arbitrum.llamarpc.com";

// Create an instance of the Agent class
let agent: Agent;

/**
 * Initializes the Agent instance.
 */
const initializeAgent = async (): Promise<void> => {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error("Mnemonic not found in the .env file.");
  }

  const wallet = ethers.Wallet.fromMnemonic(mnemonic);
  console.log(`Using wallet ${wallet.address}`);

  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const signer = wallet.connect(provider);
  agent = new Agent(signer, wallet.address);
  await agent.init();
};


// TODO: Use random text appended to tool names to avoid collisions


/**
 * Adds tools to the MCP server.
 */
server.tool(
  "chat",
  "execute lending and borrowing tools using Ember SDK",
  {
    userInput: z.string(),
  },
  async (args: { userInput: string }, /* extra: RequestHandlerExtra - Assuming RequestHandlerExtra type exists or adjust as needed */) => {
    try {
      const result = await agent.processUserInput(args.userInput);

      console.log("[server.tool] result", result);

      const responseText = typeof result?.content === 'string' 
        ? result.content 
        : JSON.stringify(result?.content) ?? "Error: Could not get a response from the agent.";
        
      return {
        content: [{ type: "text", text: responseText }],
      };
    } catch (error: unknown) {
      const err = error as Error;
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
      };
    }
  }
);

// Initialize Express app
const app = express();

// Configure CORS middleware to allow all origins
app.use(cors());

// Add a simple root route handler
app.get("/", (_req, res) => {
  res.json({
    name: "MCP SSE Agent Server",
    version: "1.0.0",
    status: "running",
    endpoints: {
      "/": "Server information (this response)",
      "/sse": "Server-Sent Events endpoint for MCP connection",
      "/messages": "POST endpoint for MCP messages",
    },
    tools: [
      { name: "chat", description: "execute lending and borrowing tools using Ember SDK" },
    ],
  });
});

// Store active SSE connections
const sseConnections = new Set();

let transport: SSEServerTransport

// SSE endpoint
app.get("/sse", async (_req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);

  // Add connection to active set
  sseConnections.add(res);

  // Setup keepalive interval
  const keepaliveInterval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepaliveInterval);
      return;
    }
    res.write(':keepalive\n\n');
  }, 30000); // Send keepalive every 30 seconds

  // Handle client disconnect
  _req.on('close', () => {
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });

  // Handle errors
  res.on('error', (err) => {
    console.error('SSE Error:', err);
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });
});

app.post("/messages", async (req, res) => {
  await transport.handlePostMessage(req, res);
});

// Start the server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const main = async () => {
  try {
    await initializeAgent();
    app.listen(PORT, () => {
      console.log(`MCP SSE Agent Server running on port ${PORT}`);
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
};

main();