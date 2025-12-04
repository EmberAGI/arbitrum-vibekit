import {
  Implementation,
  type MetaMaskSmartAccount,
  toMetaMaskSmartAccount,
  getDeleGatorEnvironment,
} from '@metamask/delegation-toolkit';
import { useAccount, usePublicClient } from 'wagmi';
import { arbitrum } from 'viem/chains';
import { Hex, nonceManager } from 'viem';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSign7702Authorization } from '@privy-io/react-auth';
import { usePrivyWalletClient } from './usePrivyWalletClient';
import { r } from 'node_modules/@metamask/delegation-toolkit/dist/index-DoP3c-jb';

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
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { walletClient, privyWallet } = usePrivyWalletClient();
  const { signAuthorization } = useSign7702Authorization();

  // Query to get smart account and check deployment status
  const {
    data: smartAccountData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['smartAccount', address],
    queryFn: async () => {
      if (!address || !publicClient || !walletClient || !privyWallet) {
        throw new Error('Wallet not connected');
      }

      const account = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Stateless7702,
        address: privyWallet.address as Hex,
        signer: { walletClient },
      });

      const deployed = await account.isDeployed();

      return {
        smartAccount: account,
        isDeployed: deployed,
      };
    },
    enabled: !!address && !!publicClient && !!walletClient,
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: 2,
  });

  // Mutation to upgrade to smart account
  const upgradeMutation = useMutation({
    mutationFn: async () => {
      if (!address || !publicClient || !walletClient || !privyWallet) {
        throw new Error('Wallet not connected');
      }

      // Get the DeleGator environment for Arbitrum
      const environment = getDeleGatorEnvironment(arbitrum.id);
      const contractAddress = environment.implementations.EIP7702StatelessDeleGatorImpl;

      // Sign the authorization using Privy
      const authorization = await signAuthorization({
        contractAddress,
        chainId: arbitrum.id,
        executor: '0x33adef7fb0b26a59215bec0cbc22b91d9d518c4f',
      });

      // Send the authorization to the backend for relay
      const response = await fetch(`/api/wallet/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      if (!data.transactionHash) {
        throw new Error('No transaction hash returned');
      }

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({ hash: data.transactionHash as Hex });

      return data.transactionHash;
    },
    onSuccess: () => {
      // Invalidate and refetch smart account data after successful upgrade
      queryClient.invalidateQueries({ queryKey: ['smartAccount', address] });
    },
  });

  return {
    smartAccount: smartAccountData?.smartAccount || null,
    isDeployed: smartAccountData?.isDeployed,
    isUpgrading: upgradeMutation.isPending,
    upgradeToSmartAccount: upgradeMutation.mutate,
    error: queryError || upgradeMutation.error,
    isLoading,
  };
}
