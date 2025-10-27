import { http } from 'msw';

import { createResponseFromMock } from '../utils/error-simulation.js';

// Match both with and without trailing slash
const ETH_RPC_URL = 'https://eth.merkle.io';
const ARBITRUM_RPC_URL = 'https://arb-mainnet.g.alchemy.com/v2/PppihPeNg7SHljhEKcarydM45ytHOAhe';
const PIMLICO_URL = 'https://api.pimlico.io/v2/42161/rpc';

type JsonRpcRequest = {
  id: number | string | null;
  method: string;
  params?: unknown[];
};

/**
 * Compute deterministic mockKey from JSON-RPC request
 * Maps RPC method and params to the mock file key
 */
function computeMockKey(body: JsonRpcRequest): string {
  const { method, params = [] } = body;

  // Create mock key from method and params
  // Example: eth_chainId → eth_chainId
  // Example: eth_getBlockByNumber with ['latest', false] → eth_getBlockByNumber-latest-false
  const paramKey = params.length > 0 ? `-${params.join('-')}` : '';
  return `${method}${paramKey}`;
}

const rpcHandler = async ({ request }: { request: Request }) => {
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const mockKey = computeMockKey(body);

  if (process.env['DEBUG_TESTS']) {
    console.log(`[MSW viem handler] Attempting to load mock: ${mockKey}`);
  }

  // Return recorded JSON-RPC response unmodified
  // If mock is missing, test will fail with clear error message
  try {
    const response = await createResponseFromMock(mockKey, 'viem');
    if (process.env['DEBUG_TESTS']) {
      console.log(`[MSW viem handler] Successfully loaded mock: ${mockKey}`);
    }
    return response;
  } catch (error) {
    // Log error for debugging and return 500 with details
    if (process.env['DEBUG_TESTS']) {
      console.error(`[MSW viem handler] Failed to load mock: ${mockKey}`, error);
      console.error(`[MSW viem handler] Error stack:`, (error as Error).stack);
    }
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32603,
          message: `Mock loading failed for ${mockKey}: ${(error as Error).message}`,
        },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

export const viemHandlers = [
  // Ethereum mainnet RPC
  http.post(ETH_RPC_URL, rpcHandler),
  http.post(`${ETH_RPC_URL}/`, rpcHandler),

  // Arbitrum RPC (for workflow operations)
  http.post(ARBITRUM_RPC_URL, rpcHandler),
  http.post(`${ARBITRUM_RPC_URL}/`, rpcHandler),

  // Pimlico bundler/paymaster (catch-all for query params)
  http.post(`${PIMLICO_URL}*`, rpcHandler),
];
