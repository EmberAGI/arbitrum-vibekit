import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import 'dotenv/config';

const DEFAULT_MAINNET_URL = 'https://api.arbiscan.io/api';
const DEFAULT_TESTNET_URL = 'https://api-testnet.arbiscan.io/api';

function getBaseUrl(network: string) {
  if (network === 'testnet') {
    return process.env.ARBISCAN_TESTNET_BASE_URL || DEFAULT_TESTNET_URL;
  }
  return process.env.ARBISCAN_BASE_URL || DEFAULT_MAINNET_URL;
}

async function callArbiscan(params: Record<string, string>, network: string) {
  const url = new URL(getBaseUrl(network));
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  url.searchParams.append('apikey', process.env.ARBISCAN_API_KEY || '');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as unknown;
}

const networkEnum = z.enum(['mainnet', 'testnet']);

const getAccountBalanceSchema = {
  address: z.string().describe('The account address to query.'),
  network: networkEnum.default('mainnet').describe('Arbitrum network.'),
  tag: z.string().default('latest').describe('Block tag for balance query.'),
};

type GetAccountBalanceParams = z.infer<ReturnType<typeof z.object<typeof getAccountBalanceSchema>>>;

const getTransactionSchema = {
  hash: z.string().describe('Transaction hash to fetch.'),
  network: networkEnum.default('mainnet').describe('Arbitrum network.'),
};

type GetTransactionParams = z.infer<ReturnType<typeof z.object<typeof getTransactionSchema>>>;

const getTokenTransfersSchema = {
  address: z.string().describe('Account address to fetch transfers for.'),
  network: networkEnum.default('mainnet').describe('Arbitrum network.'),
  page: z.string().optional().describe('Page number for pagination.'),
  offset: z.string().optional().describe('Number of results per page.'),
};

type GetTokenTransfersParams = z.infer<ReturnType<typeof z.object<typeof getTokenTransfersSchema>>>;

const getTokenBalanceSchema = {
  address: z.string().describe('Wallet address holding the token.'),
  contract: z.string().describe('ERC-20 token contract address.'),
  network: networkEnum.default('mainnet').describe('Arbitrum network.'),
  tag: z.string().default('latest').describe('Block tag for balance query.'),
};

type GetTokenBalanceParams = z.infer<ReturnType<typeof z.object<typeof getTokenBalanceSchema>>>;

const getBlockNumberSchema = {
  network: networkEnum.default('mainnet').describe('Arbitrum network.'),
};

type GetBlockNumberParams = z.infer<ReturnType<typeof z.object<typeof getBlockNumberSchema>>>;

const getGasPriceSchema = {
  network: networkEnum.default('mainnet').describe('Arbitrum network.'),
};

type GetGasPriceParams = z.infer<ReturnType<typeof z.object<typeof getGasPriceSchema>>>;

const server = new McpServer({ name: 'arbscan-mcp-tool-server', version: '1.0.0' });

server.tool(
  'getAccountBalance',
  'Get ETH balance for an address on Arbitrum.',
  getAccountBalanceSchema,
  async (params: GetAccountBalanceParams) => {
    try {
      const data = await callArbiscan(
        {
          module: 'account',
          action: 'balance',
          address: params.address,
          tag: params.tag,
        },
        params.network,
      );
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Error: ${(error as Error).message}` }] };
    }
  },
);

server.tool(
  'getTransaction',
  'Get transaction details by hash.',
  getTransactionSchema,
  async (params: GetTransactionParams) => {
    try {
      const data = await callArbiscan(
        {
          module: 'proxy',
          action: 'eth_getTransactionByHash',
          txhash: params.hash,
        },
        params.network,
      );
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Error: ${(error as Error).message}` }] };
    }
  },
);

server.tool(
  'getTokenTransfers',
  'List ERC-20 token transfers for an address.',
  getTokenTransfersSchema,
  async (params: GetTokenTransfersParams) => {
    try {
      const data = await callArbiscan(
        {
          module: 'account',
          action: 'tokentx',
          address: params.address,
          page: params.page || '1',
          offset: params.offset || '100',
          sort: 'asc',
        },
        params.network,
      );
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Error: ${(error as Error).message}` }] };
    }
  },
);

server.tool(
  'getTokenBalance',
  'Get the ERC-20 token balance for an address.',
  getTokenBalanceSchema,
  async (params: GetTokenBalanceParams) => {
    try {
      const data = await callArbiscan(
        {
          module: 'account',
          action: 'tokenbalance',
          contractaddress: params.contract,
          address: params.address,
          tag: params.tag,
        },
        params.network,
      );
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Error: ${(error as Error).message}` }] };
    }
  },
);

server.tool(
  'getBlockNumber',
  'Get the latest block number.',
  getBlockNumberSchema,
  async (params: GetBlockNumberParams) => {
    try {
      const data = await callArbiscan(
        {
          module: 'proxy',
          action: 'eth_blockNumber',
        },
        params.network,
      );
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Error: ${(error as Error).message}` }] };
    }
  },
);

server.tool(
  'getGasPrice',
  'Get the current gas price in wei.',
  getGasPriceSchema,
  async (params: GetGasPriceParams) => {
    try {
      const data = await callArbiscan(
        {
          module: 'proxy',
          action: 'eth_gasPrice',
        },
        params.network,
      );
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: `Error: ${(error as Error).message}` }] };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    console.error('Arbiscan MCP server started.');
    const cleanup = async () => {
      try {
        await server.close();
        console.error('Server closed.');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
