import {
  Implementation,
  type MetaMaskSmartAccount,
  toMetaMaskSmartAccount,
  getDeleGatorEnvironment,
} from '@metamask/delegation-toolkit';
import { useAccount, usePublicClient } from 'wagmi';
import { arbitrum } from 'viem/chains';
import { Hex, zeroAddress } from 'viem';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSign7702Authorization } from '@privy-io/react-auth';
import { usePrivyWalletClient } from './usePrivyWalletClient';

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
        signer: { walletClient: walletClient },
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
      });

      // Submit the authorization with a dummy transaction
      const hash = await walletClient.sendTransaction({
        authorizationList: [authorization],
        data: '0x',
        to: zeroAddress,
      });

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({ hash });

      return hash;
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
