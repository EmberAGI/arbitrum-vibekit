import { Agent } from './agent.js';
import { isAddress } from 'viem';
import * as dotenv from 'dotenv';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import cors from 'cors';
import { z } from 'zod';
import type { Task } from 'a2a-samples-js/schema';

const SwapAgentSchema = z.object({
  instruction: z
    .string()
    .describe(
      "A natural‑language swap directive, e.g. 'Swap 50 DAI into USDT' or question to ask the agent, e.g. 'How does Camelot work?'."
    ),
  userAddress: z
    .string()
    .describe('The user wallet address which is used to sign transactions and to pay for gas.'),
});
type SwapAgentArgs = z.infer<typeof SwapAgentSchema>;

dotenv.config();

// Initialize MCP server but don't connect yet
const mcpServer = new McpServer({
  name: 'mcp-sse-agent-server',
  version: '1.0.0',
});

const rpc = process.env.RPC_URL || 'https://arbitrum.llamarpc.com';

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

const agentToolName = 'askPredictAgent';
const agentToolDescription =
  'Responds to natural language queries about token price predictions and can execute swaps based on those predictions. Use this tool to ask questions like "Should I trade 1 ETH based on the 4-hour prediction?" or "Predict and swap 50 ARB if it looks like a good buy in the next 24 hours, using my ETH on Arbitrum to buy it." The agent uses Allora predictions and its `predictAndSwap` tool to provide predictions (buy/sell/hold) and execute trades.';

mcpServer.tool(
  agentToolName,
  agentToolDescription,
  SwapAgentSchema.shape,
  async (args: SwapAgentArgs) => {
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
        //sessionId: 'c295ea44-7543-4f78-b524-7a38915ad6e4',
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Error: ${err.message}` }],
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
    name: 'MCP SSE Agent Server',
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

const sseConnections = new Set<express.Response>();

let transport: SSEServerTransport;

app.get('/sse', async (_req, res) => {
  transport = new SSEServerTransport('/messages', res);
  await mcpServer.connect(transport); // Use mcpServer instead of server

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

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const main = async () => {
  let expressServer: ReturnType<typeof app.listen> | undefined;
  try {
    // First initialize the agent
    await initializeAgent();

    // Then start the Express server
    await new Promise<void>((resolve, reject) => {
      expressServer = app.listen(PORT, () => {
        console.error(`MCP SSE Agent Server running on port ${PORT}`);
        resolve();
      });

      expressServer.on('error', err => {
        reject(err);
      });
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to start server:', err.message);

    // Cleanup if initialization failed
    if (agent) {
      await agent.stop();
    }
    if (expressServer) {
      expressServer.close();
    }
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down gracefully...');
    if (agent) {
      await agent.stop();
    }
    if (expressServer) {
      expressServer.close();
    }
    process.exit(0);
  });
};

main();
