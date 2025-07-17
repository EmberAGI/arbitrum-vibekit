import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import cors from 'cors';
import * as dotenv from 'dotenv';
import express from 'express';
import { type Address } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { z } from 'zod';

import { Agent } from './agent.js';

dotenv.config();

const server = new McpServer({
  name: 'mcp-sse-agent-server',
  version: '1.0.0',
});

let agent: Agent;

const initializeAgent = async (): Promise<void> => {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error('MNEMONIC not found in the .env file.');
  }

  const quicknodeSubdomain = process.env.QUICKNODE_SUBDOMAIN;
  const apiKey = process.env.QUICKNODE_API_KEY;
  if (!quicknodeSubdomain || !apiKey) {
    throw new Error('QUICKNODE_SUBDOMAIN and QUICKNODE_API_KEY must be set in the .env file.');
  }

  const account = mnemonicToAccount(mnemonic);
  const userAddress: Address = account.address;
  console.error(`Using wallet ${userAddress}`);

  agent = new Agent(account, userAddress, quicknodeSubdomain, apiKey);
  await agent.init();
};

server.tool(
  'chat',
  'execute swapping tools using Ember On-chain Actions',
  {
    userInput: z.string(),
  },
  async (args: { userInput: string }) => {
    try {
      const result = await agent.processUserInput(args.userInput);

      console.error('[server.tool] result', result);

      const responseText =
        typeof result?.content === 'string'
          ? result.content
          : (JSON.stringify(result?.content) ?? 'Error: Could not get a response from the agent.');

      return {
        content: [{ type: 'text', text: responseText }],
      };
    } catch (error: unknown) {
      const err = error as Error;
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
      };
    }
  }
);

const app = express();

app.use(cors());

app.get('/', (_req, res) => {
  res.json({
    name: 'MCP SSE Agent Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      '/': 'Server information (this response)',
      '/sse': 'Server-Sent Events endpoint for MCP connection',
      '/messages': 'POST endpoint for MCP messages',
    },
    tools: [{ name: 'chat', description: 'execute swapping tools using Ember On-chain Actions' }],
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

const PORT = 3004;
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
