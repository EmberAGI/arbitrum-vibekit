import { createPublicClient, createWalletClient, http, type Account } from 'viem';
import { arbitrum } from 'viem/chains';

const ARBITRUM_RPC_URL =
  process.env['ARBITRUM_RPC_URL'] ?? 'https://arb-mainnet.g.alchemy.com/v2/demo-key';

const RPC_RETRY_COUNT = 2;
const RPC_TIMEOUT_MS = 8000;

type WalletInstance = ReturnType<typeof createWalletClient>;

export type OnchainClients = {
  public: ReturnType<typeof createPublicClient>;
  wallet: WalletInstance & { account: Account };
};

export function createRpcTransport(url: string): ReturnType<typeof http> {
  const baseTransport = http(url);
  const baseTransportValue: unknown = baseTransport;
  if (typeof baseTransportValue !== 'function') {
    return baseTransport;
  }
  return ((params: Parameters<typeof baseTransport>[0]) =>
    baseTransport({
      ...params,
      retryCount: RPC_RETRY_COUNT,
      timeout: RPC_TIMEOUT_MS,
    })) as ReturnType<typeof http>;
}

export function createClients(account: Account): OnchainClients {
  const transport = createRpcTransport(ARBITRUM_RPC_URL);
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
