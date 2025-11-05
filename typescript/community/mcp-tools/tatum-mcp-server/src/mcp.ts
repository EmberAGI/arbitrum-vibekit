import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pRetry from 'p-retry';
import fetch from 'node-fetch';
import { z } from 'zod';

interface Cfg { tatumApiKey: string; chain: string }

const RETRY = { factor: 2, minTimeout: 500, maxTimeout: 8000, randomize: true } as const;

async function tatumRpc(cfg: Cfg, method: string, params: any[] = []) {
  const url = `https://${cfg.chain}.gateway.tatum.io`;
  const body = { jsonrpc: '2.0', id: 1, method, params };
  return pRetry(async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.tatumApiKey,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status === 403 || res.status === 503) {
      throw new Error(`Rate/Service error ${res.status}`);
    }
    if (!res.ok) throw new Error(`RPC ${method} failed ${res.status}`);
    const data = (await res.json()) as any;
    if (data.error) throw new Error(data.error.message || 'RPC error');
    return data.result;
  }, RETRY);
}

function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

function weiToEtherString(weiHex: string): string {
  const wei = hexToBigInt(weiHex);
  const base = 10n ** 18n;
  const whole = wei / base;
  const frac = wei % base;
  const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '') || '0';
  return `${whole.toString()}${fracStr === '0' ? '' : '.' + fracStr}`;
}

const addrSchema = z.object({ address: z.string().describe('EVM address') });
const tokenBalSchema = z.object({ tokenAddress: z.string(), address: z.string() });
const blockByNumSchema = z.object({ tagOrNumber: z.string(), full: z.boolean().optional() });
const txByHashSchema = z.object({ hash: z.string() });
const logsSchema = z.object({
  fromBlock: z.string().optional(),
  toBlock: z.string().optional(),
  address: z.string().optional(),
  topics: z.array(z.string().nullable()).optional(),
});
const rpcCallSchema = z.object({ method: z.string(), params: z.array(z.any()).default([]) });

const ALLOW_METHODS = new Set([
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getBlockByNumber',
  'eth_getTransactionByHash',
  'eth_getLogs',
  'eth_call',
  'eth_chainId',
  'eth_gasPrice',
  'eth_estimateGas',
  'eth_getCode',
  'eth_getTransactionReceipt',
]);

export async function createServer(cfg: Cfg) {
  const server = new McpServer({ name: 'tatum-mcp-server', version: '1.0.0' });

  server.tool(
    'get_block_number',
    'Get latest Arbitrum block number',
    z.object({}).shape,
    async () => {
      const hex = await tatumRpc(cfg, 'eth_blockNumber');
      const result = { hex, decimal: hexToBigInt(hex).toString() };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_native_balance',
    'Get native balance for address',
    addrSchema.shape,
    async ({ address }) => {
      const hex = await tatumRpc(cfg, 'eth_getBalance', [address, 'latest']);
      const result = { address, hexWei: hex, wei: hexToBigInt(hex).toString(), ether: weiToEtherString(hex) };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_token_balance',
    'Get ERC20 balance',
    tokenBalSchema.shape,
    async ({ tokenAddress, address }) => {
      const balCall = {
        to: tokenAddress,
        data: '0x70a08231' + address.replace(/^0x/, '').padStart(64, '0'),
      };
      const decCall = { to: tokenAddress, data: '0x313ce567' };
      const hexBal = await tatumRpc(cfg, 'eth_call', [balCall, 'latest']);
      let decimals = 18;
      try {
        const hexDec = await tatumRpc(cfg, 'eth_call', [decCall, 'latest']);
        decimals = Number(hexToBigInt(hexDec));
      } catch {}
      const raw = hexToBigInt(hexBal);
      const base = 10n ** BigInt(decimals);
      const whole = raw / base;
      const frac = raw % base;
      const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '') || '0';
      const formatted = `${whole.toString()}${fracStr === '0' ? '' : '.' + fracStr}`;
      const result = { tokenAddress, address, hex: hexBal, raw: raw.toString(), decimals, formatted };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_block_by_number',
    'Get block by number or tag',
    blockByNumSchema.shape,
    async ({ tagOrNumber, full }) => {
      const block = await tatumRpc(cfg, 'eth_getBlockByNumber', [tagOrNumber, !!full]);
      return { content: [{ type: 'text', text: JSON.stringify(block, null, 2) }] };
    }
  );

  server.tool(
    'get_transaction_by_hash',
    'Get transaction by hash',
    txByHashSchema.shape,
    async ({ hash }) => {
      const tx = await tatumRpc(cfg, 'eth_getTransactionByHash', [hash]);
      return { content: [{ type: 'text', text: JSON.stringify(tx, null, 2) }] };
    }
  );

  server.tool(
    'get_logs',
    'Get logs by filter',
    logsSchema.shape,
    async ({ fromBlock, toBlock, address, topics }) => {
      const logs = await tatumRpc(cfg, 'eth_getLogs', [{ fromBlock, toBlock, address, topics }]);
      return { content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }] };
    }
  );

  server.tool(
    'rpc_call',
    'Allow-listed raw RPC call',
    rpcCallSchema.shape,
    async ({ method, params }) => {
      if (!ALLOW_METHODS.has(method)) throw new Error('Method not allowed');
      const result = await tatumRpc(cfg, method, params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  return server;
}


