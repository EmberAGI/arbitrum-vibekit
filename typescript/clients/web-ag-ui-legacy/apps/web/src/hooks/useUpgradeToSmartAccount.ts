'use client';

import {
  Implementation,
  type MetaMaskSmartAccount,
  toMetaMaskSmartAccount,
  getDeleGatorEnvironment,
} from '@metamask/delegation-toolkit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSign7702Authorization } from '@privy-io/react-auth';
import { useEffect, useMemo } from 'react';
import { createPublicClient, http, type Hex } from 'viem';
import { arbitrum } from 'viem/chains';
import { usePrivyWalletClient } from './usePrivyWalletClient';

interface UpgradeResponse {
  message: string;
  upgraded: boolean;
  transactionHash?: string;
  chain?: string;
  error?: string;
  details?: string;
}

interface UseUpgradeToSmartAccountReturn {
  smartAccount: MetaMaskSmartAccount | null;
  isDeployed: boolean | undefined;
  isUpgrading: boolean;
  upgradeToSmartAccount: () => void;
  error: Error | null;
  isLoading: boolean;
}

export function useUpgradeToSmartAccount(): UseUpgradeToSmartAccountReturn {
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: arbitrum,
        transport: http(arbitrum.rpcUrls.default.http[0]),
      }),
    [],
  );

  const queryClient = useQueryClient();
  const { walletClient, privyWallet, chainId } = usePrivyWalletClient();
  const { signAuthorization } = useSign7702Authorization();

  const smartAccountQuery = useQuery({
    queryKey: ['smartAccount', privyWallet?.address, chainId],
    queryFn: async () => {
      if (!walletClient || !privyWallet) throw new Error('Wallet not connected');
      if (chainId !== arbitrum.id) throw new Error('Switch to Arbitrum to upgrade wallet');

      const account = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Stateless7702,
        address: privyWallet.address as Hex,
        signer: { walletClient },
      });

      return { smartAccount: account, isDeployed: await account.isDeployed() };
    },
    enabled: Boolean(walletClient && privyWallet && chainId),
    staleTime: 30000,
    retry: 2,
  });

  const isDeployed = smartAccountQuery.data?.isDeployed;

  useEffect(() => {
    if (!privyWallet?.address) return;
    if (typeof isDeployed !== 'boolean') return;
    console.info(`[wallet upgrade] smart account deployed for ${privyWallet.address}: ${isDeployed}`);
  }, [isDeployed, privyWallet?.address]);

  const upgradeMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient || !privyWallet) throw new Error('Wallet not connected');
      if (chainId !== arbitrum.id) throw new Error('Switch to Arbitrum to upgrade wallet');

      const environment = getDeleGatorEnvironment(arbitrum.id);
      const contractAddress = environment.implementations.EIP7702StatelessDeleGatorImpl;

      const executorAddress = process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS;
      if (!executorAddress) {
        throw new Error('NEXT_PUBLIC_EXECUTOR_ADDRESS environment variable is not set');
      }

      const authorization = await signAuthorization({
        contractAddress,
        chainId: arbitrum.id,
        executor: executorAddress as Hex,
      });

      const response = await fetch('/api/wallet/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorization: {
            r: authorization.r,
            s: authorization.s,
            v: authorization.v?.toString(),
            yParity: authorization.yParity,
            chainId: authorization.chainId,
            address: authorization.address,
            nonce: authorization.nonce,
          },
          address: privyWallet.address,
        }),
      });

      const data: UpgradeResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to upgrade wallet');
      }
      if (!data.transactionHash) throw new Error('No transaction hash returned');

      await publicClient.waitForTransactionReceipt({ hash: data.transactionHash as Hex });
      return data.transactionHash;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['smartAccount', privyWallet?.address, chainId] });
    },
  });

  const queryError = (smartAccountQuery.error as Error | null) ?? null;
  const mutationError = (upgradeMutation.error as Error | null) ?? null;

  return {
    smartAccount: smartAccountQuery.data?.smartAccount ?? null,
    isDeployed,
    isUpgrading: upgradeMutation.isPending,
    upgradeToSmartAccount: upgradeMutation.mutate,
    error: queryError ?? mutationError,
    isLoading: smartAccountQuery.isLoading,
  };
}
