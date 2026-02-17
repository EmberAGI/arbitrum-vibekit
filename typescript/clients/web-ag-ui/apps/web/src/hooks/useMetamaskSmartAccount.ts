'use client';

import {
  Implementation,
  type MetaMaskSmartAccount,
  toMetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createPublicClient, http, type Hex } from 'viem';
import { arbitrum } from 'viem/chains';
import { usePrivyWalletClient } from './usePrivyWalletClient';

interface UseMetamaskSmartAccountReturn {
  smartAccount: MetaMaskSmartAccount | null;
  isLoading: boolean;
  error: Error | null;
}

export function useMetamaskSmartAccount(): UseMetamaskSmartAccountReturn {
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: arbitrum,
        transport: http(arbitrum.rpcUrls.default.http[0]),
      }),
    [],
  );

  const { walletClient, privyWallet, chainId } = usePrivyWalletClient();

  const query = useQuery({
    queryKey: ['metamaskSmartAccount', privyWallet?.address, chainId],
    queryFn: async (): Promise<MetaMaskSmartAccount> => {
      if (!walletClient || !privyWallet) throw new Error('Wallet not connected');
      if (chainId !== arbitrum.id) throw new Error('Switch to Arbitrum to use smart accounts');

      return toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Stateless7702,
        address: privyWallet.address as Hex,
        signer: { walletClient },
      });
    },
    enabled: Boolean(walletClient && privyWallet && chainId),
    staleTime: 30000,
    retry: 2,
  });

  return {
    smartAccount: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
