import { http } from 'msw';

const ONCHAIN_ACTIONS_URL = 'https://api.emberai.xyz';

export const onchainActionsHandlers = [
  // Supply liquidity endpoint
  http.post(`${ONCHAIN_ACTIONS_URL}/liquidity/supply`, async () => {
    // Return mock response for supply liquidity
    return new Response(
      JSON.stringify({
        transactions: [
          {
            type: 'EVM_TX',
            to: '0x888888888889758F76e7103c6CbF23ABbF58F946', // Pendle swap address
            data: '0x12599ac6000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000a1a1a107e45b7ced86833863f482bc5f4ed82ef0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a7640000',
            value: '0',
            chainId: '42161',
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }),

  // Swap endpoint (if needed in future)
  http.post(`${ONCHAIN_ACTIONS_URL}/swap`, async () => {
    return new Response(
      JSON.stringify({
        fromToken: {
          tokenUid: { chainId: '42161', address: '0x' },
          name: 'Token',
          symbol: 'TKN',
          decimals: 18,
          isNative: false,
          iconUri: null,
          isVetted: true,
        },
        toToken: {
          tokenUid: { chainId: '42161', address: '0x' },
          name: 'Token',
          symbol: 'TKN',
          decimals: 18,
          isNative: false,
          iconUri: null,
          isVetted: true,
        },
        exactFromAmount: '0',
        displayFromAmount: '0',
        exactToAmount: '0',
        displayToAmount: '0',
        transactions: [],
        estimation: {
          effectivePrice: '0',
          timeEstimate: '0',
          expiration: '0',
        },
        providerTracking: {
          requestId: '0',
          providerName: 'mock',
          explorerUrl: 'https://mock.com',
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }),
];
