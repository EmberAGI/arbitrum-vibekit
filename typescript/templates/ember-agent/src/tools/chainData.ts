import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { EmberContext } from '../context/types.js';
import { TaskState } from '@google-a2a/types';

const addrSchema = z.object({ address: z.string() });
const txHashSchema = z.object({ hash: z.string() });
const logsSchema = z.object({ fromBlock: z.string().optional(), toBlock: z.string().optional(), address: z.string().optional(), topics: z.array(z.string().nullable()).optional() });
const rpcSchema = z.object({ method: z.string(), params: z.array(z.any()).default([]) });

function ensureMcp(context: any) {
  const client = context.mcpClients?.['tatum-gateway'] || context.custom.mcpClient || null;
  if (!client) throw new Error('Tatum MCP client not available');
  return client;
}

export const getNativeBalanceTool: VibkitToolDefinition<typeof addrSchema, any, EmberContext> = {
  name: 'get-native-balance',
  description: 'Get native balance for an address',
  parameters: addrSchema,
  execute: async ({ address }, context) => {
    const mcp = ensureMcp(context);
    const res = await mcp.callTool({ name: 'get_native_balance', arguments: { address } });
    return {
      id: address,
      contextId: `balance-${Date.now()}`,
      kind: 'task',
      status: { state: TaskState.Completed, message: { role: 'agent', kind: 'message', messageId: `msg-${Date.now()}`, parts: [{ kind: 'text', text: String((res as any)?.text || (res as any)) }] } },
    } as any;
  },
};

export const getTxByHashTool: VibkitToolDefinition<typeof txHashSchema, any, EmberContext> = {
  name: 'get-transaction-by-hash',
  description: 'Get transaction details by hash',
  parameters: txHashSchema,
  execute: async ({ hash }, context) => {
    const mcp = ensureMcp(context);
    const res = await mcp.callTool({ name: 'get_transaction_by_hash', arguments: { hash } });
    return {
      id: hash,
      contextId: `tx-${Date.now()}`,
      kind: 'task',
      status: { state: TaskState.Completed, message: { role: 'agent', kind: 'message', messageId: `msg-${Date.now()}`, parts: [{ kind: 'text', text: JSON.stringify((res as any)?.structuredContent || res) }] } },
    } as any;
  },
};

export const getLogsTool: VibkitToolDefinition<typeof logsSchema, any, EmberContext> = {
  name: 'get-logs',
  description: 'Get logs by filter',
  parameters: logsSchema,
  execute: async (args, context) => {
    const mcp = ensureMcp(context);
    const res = await mcp.callTool({ name: 'get_logs', arguments: args as any });
    return {
      id: 'logs',
      contextId: `logs-${Date.now()}`,
      kind: 'task',
      status: { state: TaskState.Completed, message: { role: 'agent', kind: 'message', messageId: `msg-${Date.now()}`, parts: [{ kind: 'text', text: JSON.stringify((res as any)?.structuredContent || res) }] } },
    } as any;
  },
};

export const rpcCallTool: VibkitToolDefinition<typeof rpcSchema, any, EmberContext> = {
  name: 'rpc-call',
  description: 'Call an allow-listed RPC method via Tatum',
  parameters: rpcSchema,
  execute: async ({ method, params }, context) => {
    const mcp = ensureMcp(context);
    const res = await mcp.callTool({ name: 'rpc_call', arguments: { method, params } });
    return {
      id: method,
      contextId: `rpc-${Date.now()}`,
      kind: 'task',
      status: { state: TaskState.Completed, message: { role: 'agent', kind: 'message', messageId: `msg-${Date.now()}`, parts: [{ kind: 'text', text: JSON.stringify((res as any)?.structuredContent || res) }] } },
    } as any;
  },
};


