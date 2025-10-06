import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { getNativeBalanceTool, getLogsTool, getTxByHashTool, rpcCallTool } from '../tools/chainData.js';

export const chainDataInputSchema = z.object({
  instruction: z.string().describe('Natural language request for chain data'),
  address: z.string().optional(),
  hash: z.string().optional(),
});

export const chainDataSkill = defineSkill({
  id: 'chain-data',
  name: 'Chain Data',
  description: 'Query Arbitrum chain data via Tatum MCP gateway',
  tags: ['arbitrum', 'rpc', 'tatum', 'data'],
  examples: ['Get my ETH balance', 'Fetch tx by hash', 'Get logs for a contract'],
  inputSchema: chainDataInputSchema,
  mcpServers: {
    'tatum-gateway': {
      url: process.env.TATUM_MCP_SERVER_URL || 'http://localhost:3010',
      alwaysAllow: ['get_block_number', 'get_native_balance', 'get_token_balance', 'get_block_by_number', 'get_transaction_by_hash', 'get_logs', 'rpc_call'],
    },
  },
  tools: [getNativeBalanceTool, getLogsTool, getTxByHashTool, rpcCallTool],
});


