import { createPublicClient, createWalletClient, http, type Account } from 'viem';
import { arbitrum } from 'viem/chains';

const ARBITRUM_RPC_URL = process.env['ARBITRUM_RPC_URL'] ?? 'https://arbitrum.meowrpc.com';

type WalletInstance = ReturnType<typeof createWalletClient>;

export type OnchainClients = {
  public: ReturnType<typeof createPublicClient>;
  wallet: WalletInstance & { account: Account };
};

export function createClients(account: Account): OnchainClients {
  const transport = http(ARBITRUM_RPC_URL);
  const publicClient = createPublicClient({
    chain: arbitrum,
    transport,
  });
  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport,
  }) as WalletInstance & { account: Account };

  return {
    public: publicClient,
    wallet: walletClient,
  };
}
