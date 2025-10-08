'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { darkTheme, getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { cookieStorage, cookieToInitialState, createStorage, WagmiProvider } from 'wagmi';
import { mainnet, arbitrum, arbitrumSepolia} from 'wagmi/chains';
import { metaMaskWallet, walletConnectWallet, coinbaseWallet, injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { RainbowKitSiweNextAuthProvider } from '@rainbow-me/rainbowkit-siwe-next-auth';

export function ProviderWrapper({ children }: { children: React.ReactNode }) {
  const config = useMemo(
    () =>
      getDefaultConfig({
        appName: 'Arbitrum VibeKit',
        projectId: '4b49e5e63b9f6253943b470873b47208',
        chains: [arbitrum, mainnet, arbitrumSepolia],
        wallets: [
          {
            groupName: 'Recommended',
            wallets: [
              () => metaMaskWallet({ projectId: '4b49e5e63b9f6253943b470873b47208' }),
              () => walletConnectWallet({ projectId: '4b49e5e63b9f6253943b470873b47208' }),
              () => coinbaseWallet({ appName: 'Arbitrum VibeKit' }),
              () => injectedWallet(),
            ],
          },
        ],
        ssr: true, // If your dApp uses server side rendering (SSR)
        storage: createStorage({ storage: cookieStorage }),
      }),
    []
  );

  const queryClient = useMemo(() => new QueryClient(), []);
  const cookie = cookieStorage.getItem('wagmi.storage') || '';
  const initialState = cookieToInitialState(config, cookie);

  return (
    <>
      <WagmiProvider config={config} reconnectOnMount={true} initialState={initialState}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitSiweNextAuthProvider>
            <RainbowKitProvider
              theme={darkTheme({
                accentColor: "#4E76A9",
                accentColorForeground: "#fff",
              })}
              initialChain={arbitrum}
            >
              {children}
            </RainbowKitProvider>
          </RainbowKitSiweNextAuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  );
}
