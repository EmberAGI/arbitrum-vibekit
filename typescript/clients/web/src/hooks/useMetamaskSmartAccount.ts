import {
  Implementation,
  type MetaMaskSmartAccount,
  toMetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';

interface UseMetamaskSmartAccountReturn {
  smartAccount: MetaMaskSmartAccount | null;
  isLoading: boolean;
  error: Error | null;
}

export default function useMetamaskSmartAccount(): UseMetamaskSmartAccountReturn {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const {
    data: smartAccount,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['metamaskSmartAccount', address],
    queryFn: async (): Promise<MetaMaskSmartAccount> => {
      if (!address || !walletClient || !publicClient) {
        throw new Error('Wallet not connected');
      }

      console.log('Creating smart account');

      const smartAccount = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Stateless7702,
        address,
        signer: { walletClient },
      });

      return smartAccount;
    },
    enabled: !!address && !!walletClient && !!publicClient,
    staleTime: 60000, // Consider data fresh for 1 minute
    retry: 2,
  });

  return {
    smartAccount: smartAccount || null,
    isLoading,
    error,
  };
}
