import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import * as dotenv from 'dotenv';
import express from 'express';
import { isAddress } from 'viem';

import { Agent } from './agent.js';
import cors from 'cors';
import { z } from 'zod';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';

const SwappingAgentSchema = z.object({
  instruction: z
    .string()
    .describe(
      "A natural-language swapping directive, e.g. 'Swap 1 ETH to USDC' or 'Convert 100 DAI to WETH' or questions about Camelot DEX."
    ),
  userAddress: z
    .string()
    .describe('The user wallet address which is used to sign transactions and to pay for gas.'),
});
type SwappingAgentArgs = z.infer<typeof SwappingAgentSchema>;

dotenv.config();

const server = new McpServer({
  name: 'swapping-agent-server',
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

const agentToolName = 'askSwappingAgent';
const agentToolDescription =
  'Sends a free-form, natural-language swapping instruction to this swapping AI agent via Ember AI On-chain Actions MCP server (onchain-actions) and returns a structured quote including transaction data. You can also ask questions about Camelot DEX.';

server.tool(
  agentToolName,
  agentToolDescription,
  SwappingAgentSchema.shape,
  async (args: SwappingAgentArgs) => {
    const { instruction, userAddress } = args;
    if (!isAddress(userAddress)) {
      throw new Error('Invalid user address provided.');
    }
    try {
      const taskResponse = await agent.processUserInput(instruction, userAddress);

      console.error('[server.tool] result', taskResponse);

      return {
        content: [{ type: 'text', text: JSON.stringify(taskResponse) }],
      };
    } catch (error: unknown) {
      const err = error as Error;
      const errorTask: Task = {
        id: userAddress,
        contextId: `error-${Date.now()}`,
        kind: 'task',
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `Error: ${err.message}` }],
          },
        },
      };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(errorTask) }],
      };
    }
  }
);

const app = express();

app.use(cors());

app.get('/', (_req, res) => {
  res.json({
    name: 'Swapping Agent No Wallet Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      '/': 'Server information (this response)',
      '/sse': 'Server-Sent Events endpoint for MCP connection',
      '/messages': 'POST endpoint for MCP messages',
    },
    tools: [{ name: agentToolName, description: agentToolDescription }],
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

const PORT = 3005;
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
