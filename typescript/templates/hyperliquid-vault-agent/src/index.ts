import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { Task } from 'a2a-samples-js';
import cors from 'cors';
import * as dotenv from 'dotenv';
import express from 'express';
import { z } from 'zod';

import { HyperliquidVaultAgent } from './agent.js';

const HyperliquidAgentSchema = z.object({
  instruction: z
    .string()
    .describe(
      "A natural-language trading signal instruction, e.g. 'Buy BTC with TP1 at 100k, TP2 at 105k, and SL at 95k' or 'Sell ETH, take profit at 3500 and 3200, stop loss at 4200, exit in 6 hours'."
    ),
});
type HyperliquidAgentArgs = z.infer<typeof HyperliquidAgentSchema>;

dotenv.config();

const server = new McpServer({
  name: 'mcp-sse-hyperliquid-vault-agent-server',
  version: '1.0.0',
});

let agent: HyperliquidVaultAgent;

const initializeAgent = async (): Promise<void> => {
  const apiBaseUrl = process.env.HYPERLIQUID_API_URL || 'http://127.0.0.1:5000';

  agent = new HyperliquidVaultAgent(apiBaseUrl);
  await agent.init();
};

const agentToolName = 'askHyperliquidVaultAgent';
const agentToolDescription =
  'Sends a free-form, natural-language trading signal instruction to the Hyperliquid Vault AI agent. You can specify buy/sell signals with take profit and stop loss levels. The agent will parse your instruction and execute the trade via the Hyperliquid vault. Examples: "Buy BTC with TP1 at 100k, TP2 at 105k, SL at 95k", "Sell SOL, take profit at 200 and 180, stop loss at 250, exit in 4 hours", or "Go long ETH with targets 4000 and 4500, stop at 3200".';

// Main trading signal tool
server.tool(
  agentToolName,
  agentToolDescription,
  HyperliquidAgentSchema.shape,
  async (args: HyperliquidAgentArgs) => {
    const { instruction } = args;

    try {
      const taskResponse = await agent.processUserInput(instruction);

      console.error('[server.tool] result', taskResponse);

      return {
        content: [{ type: 'text', text: JSON.stringify(taskResponse) }],
      };
    } catch (error: unknown) {
      const err = error as Error;
      const errorTask: Task = {
        id: `hyperliquid-error-${Date.now()}`,
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

// Additional tool for checking vault status
server.tool(
  'getHyperliquidVaultStatus',
  'Get the current status of active positions and vault information from the Hyperliquid vault agent.',
  {},
  async () => {
    try {
      const status = await agent.getStatus();
      const vaultBalance = await agent.getVaultBalance();

      const taskResponse: Task = {
        id: `status-${Date.now()}`,
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `📊 **Hyperliquid Vault Status**\n\n` +
                  `**Active Positions:** ${status.active_positions || 0}\n` +
                  `**Monitoring Active:** ${status.monitoring_active ? '✅ Yes' : '❌ No'}\n\n` +
                  `**Vault Balance Information:**\n` +
                  `• Total Account Value: $${vaultBalance.vault_info?.total_account_value?.toFixed(2) || 'N/A'}\n` +
                  `• Withdrawable: $${vaultBalance.vault_info?.withdrawable?.toFixed(2) || 'N/A'}\n` +
                  `• Vault Address: ${vaultBalance.vault_info?.vault_address || 'N/A'}\n\n` +
                  `**Position Size Examples (if trading BTC at $${vaultBalance.btc_price?.toFixed(0) || 'N/A'}):**\n` +
                  Object.entries(vaultBalance.position_size_examples || {}).map(([pct, sizes]: [string, any]) =>
                    `• ${pct}: $${sizes.usd} (${sizes.btc} BTC)`
                  ).join('\n')
              },
            ],
          },
        },
        metadata: {
          operation: 'status_check',
          status,
          vaultBalance,
        },
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(taskResponse) }],
      };
    } catch (error: unknown) {
      const err = error as Error;
      const errorTask: Task = {
        id: `status-error-${Date.now()}`,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Error getting vault status: ${err.message}` }],
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
    name: 'MCP SSE Hyperliquid Vault Agent Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      '/': 'Server information (this response)',
      '/sse': 'Server-Sent Events endpoint for MCP connection',
      '/messages': 'POST endpoint for MCP messages',
    },
    tools: [
      { name: agentToolName, description: agentToolDescription },
      { name: 'getHyperliquidVaultStatus', description: 'Get vault status and active positions' },
    ],
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

const PORT = parseInt(process.env.PORT || '3012', 10);
const main = async () => {
  try {
    await initializeAgent();
    app.listen(PORT, () => {
      console.error(`🚀 Hyperliquid Vault Agent running on port ${PORT}`);
      console.error(`📍 Base URL: http://localhost:${PORT}`);
      console.error(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
      console.error('✨ Ready to execute trading signals on Hyperliquid vault!');
      console.error(`🔗 Python API: ${process.env.HYPERLIQUID_API_URL || 'http://127.0.0.1:5000'}`);
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

main(); 