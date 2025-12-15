import { type ConnectedWallet, useWallets } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import {
  Account,
  Chain,
  createWalletClient,
  custom,
  Hex,
  Transport,
  type WalletClient,
} from 'viem';
import { arbitrum } from 'viem/chains';

type UsePrivyWalletClientReturn = {
  walletClient: WalletClient<Transport, Chain, Account> | null;
  privyWallet: ConnectedWallet | null;
  isLoading: boolean;
  error: Error | null;
};

export function usePrivyWalletClient(): UsePrivyWalletClientReturn {
  const { wallets } = useWallets();

  const {
    data: result,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['privyWalletClient', wallets?.map((wallet) => wallet.address).join('-')],
    queryFn: async () => {
      const privyWallet = wallets.find((wallet) => wallet.walletClientType === 'privy');
      if (!privyWallet) {
        return { walletClient: null, privyWallet: null } as const;
      }

      await privyWallet.switchChain(arbitrum.id);
      const provider = await privyWallet.getEthereumProvider();

      const walletClient = createWalletClient({
        account: privyWallet.address as Hex,
        chain: arbitrum,
        transport: custom(provider),
      });

      return { walletClient, privyWallet } as const;
    },
    enabled: wallets.length > 0,
    staleTime: 30000,
    retry: 1,
  });

  return {
    walletClient: result?.walletClient ?? null,
    privyWallet: result?.privyWallet ?? null,
    isLoading,
    error: (error as Error | null) ?? null,
  };
}
