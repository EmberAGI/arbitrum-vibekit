import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import cors from 'cors';
import * as dotenv from 'dotenv';
import express from 'express';
import { isAddress } from 'viem';
import { z } from 'zod';

import { Agent } from './agent.js';

dotenv.config();

const server = new McpServer({
  name: 'mcp-sse-agent-server',
  version: '1.0.0',
});

let agent: Agent;

const initializeAgent = async (): Promise<void> => {
  const quicknodeSubdomain = process.env.QUICKNODE_SUBDOMAIN;
  const apiKey = process.env.QUICKNODE_API_KEY;
  if (!quicknodeSubdomain || !apiKey) {
    throw new Error('QUICKNODE_SUBDOMAIN and QUICKNODE_API_KEY must be set in the .env file.');
  }

  agent = new Agent(quicknodeSubdomain, apiKey);
  await agent.init();
};

// Define tool name and description for clarity
const agentToolName = 'askYieldTokenizationAgent';
const agentToolDescription =
  'Sends a free-form, natural-language instruction to the yield trading agent via Ember MCP server, returning market information or a structured swap transaction plan. Example: "Swap 0.00001 wstETH to wstETH_YT via wstETH market on arbitrum one".';
server.tool(
  agentToolName,
  agentToolDescription,
  {
    instruction: z.string().describe('A natural-language directive for the Pendle agent.'),
    userAddress: z.string().describe('The user wallet address for external signing.'),
  },
  async (args: { instruction: string; userAddress: string }) => {
    if (!isAddress(args.userAddress)) {
      throw new Error('Invalid userAddress provided.');
    }
    try {
      const taskResponse = await agent.processUserInput(args.instruction, args.userAddress);

      console.error('[server.tool] result', taskResponse);

      const responseText = JSON.stringify(taskResponse);

      return { content: [{ type: 'text', text: responseText }] };
    } catch (error: unknown) {
      const err = error as Error;
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

const app = express();

app.use(cors());

app.get('/', (_req, res) => {
  res.json({
    name: 'MCP SSE Pendle Agent Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      '/': 'Server information (this response)',
      '/sse': 'Server-Sent Events endpoint for MCP connection',
      '/messages': 'POST endpoint for MCP messages',
    },
    tools: [{ name: agentToolName, description: agentToolDescription }],
    capabilities: {
      markets: 'List available Pendle yield markets',
      swap: 'Generate swap transaction plans for Pendle tokens',
    },
  });
});

const sseConnections = new Set();

let transport: SSEServerTransport;

app.get('/sse', async (_req, res) => {
  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);

  sseConnections.add(res);

  const keepaliveInterval = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepaliveInterval);
      return;
    }
    res.write(':keepalive\n\n');
  }, 30000);

  _req.on('close', () => {
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });

  res.on('error', err => {
    console.error('SSE Error:', err);
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });
});

app.post('/messages', async (req, res) => {
  await transport.handlePostMessage(req, res);
});

const PORT = 3003;
const main = async () => {
  try {
    await initializeAgent();
    app.listen(PORT, () => {
      console.error(`MCP SSE Agent Server running on port ${PORT}`);
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

main();

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  if (agent) {
    await agent.stop();
  }
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => shutdown(sig));
});
