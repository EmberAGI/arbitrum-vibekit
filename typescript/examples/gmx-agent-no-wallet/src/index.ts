import * as dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
import { Agent } from './agent.js';
import { z } from 'zod';
import type { Task } from 'a2a-samples-js/schema';

// Load environment variables
dotenv.config();

// Define schema for GMX agent tool
const GmxAgentSchema = z.object({
  instruction: z
    .string()
    .describe("A natural‑language directive for GMX operations, e.g. 'Show me ETH markets on GMX'."),
  userAddress: z
    .string()
    .optional()
    .describe('The user wallet address which would be used for positions or transactions.'),
});
type GmxAgentArgs = z.infer<typeof GmxAgentSchema>;

// Create MCP server
const server = new McpServer({
  name: 'gmx-agent-server',
  version: '1.0.0',
});

// Initialize agent
let agent: Agent;

const initializeAgent = async (): Promise<void> => {
  try {
    agent = new Agent();
    await agent.init();
    console.error('Agent initialized successfully');
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to initialize GMX agent:', err.message);
    throw err;
  }
};

// Define agent tool name and description
const agentToolName = 'agent';
const agentToolDescription =
  'Sends a natural-language instruction to your GMX agent to manage positions, view markets, and more.';

// Register the GMX agent tool
server.tool(
  agentToolName,
  agentToolDescription,
  GmxAgentSchema.shape,
  async (args: GmxAgentArgs) => {
    const { instruction, userAddress } = args;
    try {
      const taskResponse = await agent.processUserInput(instruction, userAddress || '0x0000000000000000000000000000000000000000');
      
      console.log('[server.tool] result', taskResponse);
      console.log('[server.tool] result message: ',  JSON.stringify(taskResponse.status.message?.parts));
      
      return {
        content: [{ type: 'text', text: JSON.stringify(taskResponse) }],
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[server.tool] error', err.message);
      
      const errorTask: Task = {
        id: `gmx-error-${Date.now()}`,
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

// Setup Express app
const app = express();
app.use(cors());

// Home route with server info
app.get('/', (_req, res) => {
  res.json({
    name: 'GMX Agent Server',
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

// SSE connections tracking
const sseConnections = new Set<express.Response>();
let transport: SSEServerTransport;

// SSE endpoint
app.get('/sse', async (req, res) => {
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

  req.on('close', () => {
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });

  res.on('error', (err) => {
    console.error('SSE Error:', err);
    clearInterval(keepaliveInterval);
    sseConnections.delete(res);
    transport.close?.();
  });
});

// Handle MCP messages
app.post('/messages', async (req, res) => {
  await transport.handlePostMessage(req, res);
});

// Start the server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const main = async () => {
  try {
    await initializeAgent();
    app.listen(PORT, () => {
      console.error(`GMX Agent server running on port ${PORT}`);
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

main(); 