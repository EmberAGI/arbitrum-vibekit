import { type ConnectedWallet, useWallets } from '@privy-io/react-auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import {
  type Account,
  type Chain,
  createWalletClient,
  custom,
  type Hex,
  type Transport,
  type WalletClient,
} from 'viem';
import { defaultEvmChain, getEvmChainOrDefault } from '@/config/evmChains';

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

type UsePrivyWalletClientReturn = {
  walletClient: WalletClient<Transport, Chain, Account> | null;
  privyWallet: ConnectedWallet | null;
  chainId: number | null;
  switchChain: (chainId: number) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
};

function parseChainId(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('0x')) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

export function usePrivyWalletClient(): UsePrivyWalletClientReturn {
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const hasInitializedDefaultChain = useRef(false);

  const privyWallet = useMemo(() => {
    // Priority 1: External wallet (MetaMask, Coinbase, etc.)
    const externalWallet = wallets.find((wallet) => wallet.walletClientType !== 'privy');
    if (externalWallet) return externalWallet;

    // Priority 2: Embedded Privy wallet
    return wallets.find((wallet) => wallet.walletClientType === 'privy') ?? null;
  }, [wallets]);

  useEffect(() => {
    if (!privyWallet) return;
    if (hasInitializedDefaultChain.current) return;
    hasInitializedDefaultChain.current = true;

    void privyWallet.switchChain(defaultEvmChain.id).catch(() => {
      hasInitializedDefaultChain.current = false;
    });
  }, [privyWallet]);

  const providerQuery = useQuery({
    queryKey: ['privyEthereumProvider', privyWallet?.address],
    queryFn: async (): Promise<Eip1193Provider | null> => {
      if (!privyWallet) return null;
      return (await privyWallet.getEthereumProvider()) as unknown as Eip1193Provider;
    },
    enabled: Boolean(privyWallet),
    staleTime: 30000,
    retry: 1,
  });

  const chainIdQuery = useQuery({
    queryKey: ['privyWalletChainId', privyWallet?.address],
    queryFn: async (): Promise<number | null> => {
      const provider = providerQuery.data;
      if (!provider) return null;
      const chainId = await provider.request({ method: 'eth_chainId' });
      return parseChainId(chainId);
    },
    enabled: Boolean(privyWallet && providerQuery.data),
    staleTime: 5000,
    retry: 1,
  });

  const walletClientQuery = useQuery({
    queryKey: ['privyWalletClient', privyWallet?.address, chainIdQuery.data],
    queryFn: async () => {
      if (!privyWallet) return null;
      const provider = providerQuery.data;
      if (!provider) return null;

      const chain = getEvmChainOrDefault(chainIdQuery.data);

      return createWalletClient({
        account: privyWallet.address as Hex,
        chain,
        transport: custom(provider),
      });
    },
    enabled: Boolean(privyWallet && providerQuery.data),
    staleTime: 30000,
    retry: 1,
  });

  const switchChain = async (chainId: number) => {
    if (!privyWallet) return;
    await privyWallet.switchChain(chainId);
    await queryClient.invalidateQueries({ queryKey: ['privyWalletChainId', privyWallet.address] });
  };

  const error =
    (providerQuery.error as Error | null) ??
    (chainIdQuery.error as Error | null) ??
    (walletClientQuery.error as Error | null) ??
    null;

  return {
    walletClient: walletClientQuery.data ?? null,
    privyWallet,
    chainId: chainIdQuery.data ?? null,
    switchChain,
    isLoading: providerQuery.isLoading || chainIdQuery.isLoading || walletClientQuery.isLoading,
    error,
  };
}

