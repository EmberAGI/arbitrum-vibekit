import {
  Implementation,
  type MetaMaskSmartAccount,
  toMetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { Hex } from 'viem';
import { usePrivyWalletClient } from './usePrivyWalletClient';

interface UseMetamaskSmartAccountReturn {
  smartAccount: MetaMaskSmartAccount | null;
  isLoading: boolean;
  error: Error | null;
}

export default function useMetamaskSmartAccount(): UseMetamaskSmartAccountReturn {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { walletClient, privyWallet } = usePrivyWalletClient();

  const {
    data: smartAccount,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['metamaskSmartAccount', address],
    queryFn: async (): Promise<MetaMaskSmartAccount> => {
      if (!address || !walletClient || !publicClient || !privyWallet) {
        throw new Error('Wallet not connected');
      }

      console.log('Creating smart account');

      const smartAccount = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Stateless7702,
        address: privyWallet.address as Hex,
        signer: { walletClient },
      });

      return smartAccount;
    },
    enabled: !!address && !!walletClient && !!publicClient && !!privyWallet,
    staleTime: 60000, // Consider data fresh for 1 minute
    retry: 2,
  });

  return {
    smartAccount: smartAccount || null,
    isLoading,
    error,
  };
}
