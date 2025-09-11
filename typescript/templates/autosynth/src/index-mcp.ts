import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import * as dotenv from 'dotenv';
import express from 'express';
import { isAddress } from 'viem';
import cors from 'cors';
import { z } from 'zod';
import type { Task } from '@google-a2a/types';
import { TaskState } from '@google-a2a/types';
import { createTimeJobTool } from './tools/createTimeJob.js';
import { contextProvider } from './context/provider.js';

const AutoSynthAgentSchema = z.object({
  instruction: z
    .string()
    .describe(
      "A natural-language automation directive, e.g. 'Create a time-based job that runs daily at 9 AM' or 'Set up event trigger for Transfer events'"
    ),
  userAddress: z
    .string()
    .describe('The user wallet address which is used to sign transactions and to pay for gas.'),
});
type AutoSynthAgentArgs = z.infer<typeof AutoSynthAgentSchema>;

dotenv.config();

const server = new McpServer({
  name: 'autosynth-agent-server',
  version: '1.0.0',
});

let triggerxContext: any;

const initializeAgent = async (): Promise<void> => {
  try {
    triggerxContext = await contextProvider();
    console.log('✅ AutoSynth Agent context initialized');
  } catch (error) {
    console.error('❌ Failed to initialize AutoSynth Agent context:', error);
    throw error;
  }
};

const agentToolName = 'askAutoSynthAgent';
const agentToolDescription =
  'Creates automated jobs with time, event, and condition triggers using TriggerX platform. Returns transaction data for user to sign.';

server.tool(
  agentToolName,
  agentToolDescription,
  AutoSynthAgentSchema.shape,
  async (args: AutoSynthAgentArgs) => {
    const { instruction, userAddress } = args;
    if (!isAddress(userAddress)) {
      throw new Error('Invalid user address provided.');
    }
    
    try {
      console.log(`Processing instruction: ${instruction} for user: ${userAddress}`);
      
      // For now, we'll route all instructions to createTimeJob
      // In a full implementation, you'd parse the instruction to determine
      // which tool to call (time job, event job, condition job, etc.)
      
      // Parse basic job parameters from instruction
      // This is a simplified parser - you'd want more sophisticated NLP
      const parsedInput = parseInstruction(instruction);
      
      const context = {
        custom: triggerxContext,
      };
      
      const taskResponse = await createTimeJobTool.execute(
        {
          ...parsedInput,
          userAddress,
        } as any,
        context as any
      );

      console.log('[server.tool] result', taskResponse);

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

// Simple instruction parser (you'd want to make this more sophisticated)
function parseInstruction(instruction: string) {
  // Default values
  const parsed: {
    jobTitle: string;
    targetContractAddress: string;
    targetFunction: string;
    abi: string;
    arguments: string[];
    scheduleTypes: ('interval' | 'cron' | 'specific')[];
    timeInterval: number;
    recurring: boolean;
    timeFrame: number;
    targetChainId: string;
    timezone: string;
    cronExpression?: string;
    specificSchedule?: string;
  } = {
    jobTitle: `Automated Job - ${new Date().toISOString()}`,
    targetContractAddress: '0xDE85FE97A73B891f12CbBF1210cc225AF332C90B', // Default test contract
    targetFunction: 'helloWorld',
    abi: '[{"inputs":[{"internalType":"uint256","name":"value","type":"uint256"}],"name":"helloWorld","outputs":[],"stateMutability":"nonpayable","type":"function"}]',
    arguments: ['1'],
    scheduleTypes: ['interval'],
    timeInterval: 3600, // 1 hour default
    recurring: true,
    timeFrame: 24, // 24 hours
    targetChainId: '421614', // Arbitrum Sepolia
    timezone: 'UTC',
  };

  // Simple parsing logic - you'd want to make this much more sophisticated
  if (instruction.toLowerCase().includes('daily')) {
    parsed.scheduleTypes = ['cron'];
    parsed.cronExpression = '0 9 * * *'; // 9 AM daily
  } else if (instruction.toLowerCase().includes('hourly')) {
    parsed.scheduleTypes = ['interval'];
    parsed.timeInterval = 3600; // 1 hour
  } else if (instruction.toLowerCase().includes('weekly')) {
    parsed.scheduleTypes = ['cron'];
    parsed.cronExpression = '0 9 * * 1'; // 9 AM on Mondays
  }

  // Extract job title if mentioned
  const titleMatch = instruction.match(/job(?:\s+(?:called|named|titled))?\s+"([^"]+)"/i);
  if (titleMatch && titleMatch[1]) {
    parsed.jobTitle = titleMatch[1];
  }

  return parsed;
}

const app = express();

app.use(cors());

app.get('/', (_req, res) => {
  res.json({
    name: 'AutoSynth Agent Server',
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

const PORT = 3041;
const main = async () => {
  try {
    await initializeAgent();
    app.listen(PORT, () => {
      console.error(`MCP SSE AutoSynth Agent Server running on port ${PORT}`);
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
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => shutdown(sig));
});
