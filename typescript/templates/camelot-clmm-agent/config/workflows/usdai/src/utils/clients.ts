import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createPublicClient, http } from 'viem';
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import { arbitrum } from 'viem/chains';

const ARBITRUM_RPC_URL = 'https://arb-mainnet.g.alchemy.com/v2/PppihPeNg7SHljhEKcarydM45ytHOAhe';

export const PIMLICO_URL = 'https://api.pimlico.io/v2/42161/rpc?apikey=pim_ieUGqmpUGjU2bHgHm2Pc6k';

export function createClients() {
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(ARBITRUM_RPC_URL),
  });
  const bundlerClient = createBundlerClient({
    chain: arbitrum,
    transport: http(PIMLICO_URL),
  });
  const paymasterClient = createPaymasterClient({
    transport: http(PIMLICO_URL),
  });
  const pimplicoClient = createPimlicoClient({
    chain: arbitrum,
    transport: http(PIMLICO_URL),
  });

  return {
    public: publicClient,
    bundler: bundlerClient,
    paymaster: paymasterClient,
    pimlico: pimplicoClient,
  };
}

export type OnchainClients = ReturnType<typeof createClients>;
