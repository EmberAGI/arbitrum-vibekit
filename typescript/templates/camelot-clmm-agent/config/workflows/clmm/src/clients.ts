import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { createPublicClient, http } from 'viem';
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import { arbitrum } from 'viem/chains';

const ARBITRUM_RPC_URL =
  process.env['ARBITRUM_RPC_URL'] ?? 'https://arb-mainnet.g.alchemy.com/v2/demo-key';

const PIMLICO_RPC_URL =
  process.env['PIMLICO_ARBITRUM_URL'] ?? 'https://api.pimlico.io/v2/42161/rpc?apikey=demo';

export type OnchainClients = {
  public: ReturnType<typeof createPublicClient>;
  bundler: ReturnType<typeof createBundlerClient>;
  paymaster: ReturnType<typeof createPaymasterClient>;
  pimlico: ReturnType<typeof createPimlicoClient>;
};

export function createClients(): OnchainClients {
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(ARBITRUM_RPC_URL),
  });
  const bundlerClient = createBundlerClient({
    chain: arbitrum,
    transport: http(PIMLICO_RPC_URL),
  });
  const paymasterClient = createPaymasterClient({
    transport: http(PIMLICO_RPC_URL),
  });
  const pimlicoClient = createPimlicoClient({
    chain: arbitrum,
    transport: http(PIMLICO_RPC_URL),
  });

  return {
    public: publicClient,
    bundler: bundlerClient,
    paymaster: paymasterClient,
    pimlico: pimlicoClient,
  };
}
