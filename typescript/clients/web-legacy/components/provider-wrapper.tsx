'use client';

import '@rainbow-me/rainbowkit/styles.css';
import {
  darkTheme,
  getDefaultConfig,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit';
import {
  cookieStorage,
  cookieToInitialState,
  createStorage,
  WagmiProvider,
} from 'wagmi';
import { mainnet, arbitrum } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { RainbowKitSiweNextAuthProvider } from '@rainbow-me/rainbowkit-siwe-next-auth';

export function ProviderWrapper({ children }: { children: React.ReactNode }) {
  const config = useMemo(
    () =>
      getDefaultConfig({
        appName: 'Arbitrum VibeKit',
        projectId: '4b49e5e63b9f6253943b470873b47208',
        chains: [arbitrum, mainnet],
        ssr: true, // If your dApp uses server side rendering (SSR)
        storage: createStorage({ storage: cookieStorage }),
      }),
    [],
  );

  const queryClient = useMemo(() => new QueryClient(), []);
  const cookie = cookieStorage.getItem('wagmi.storage') || '';
  const initialState = cookieToInitialState(config, cookie);

  return (
    <>
      <WagmiProvider
        config={config}
        reconnectOnMount={true}
        initialState={initialState}
      >
        <QueryClientProvider client={queryClient}>
          <RainbowKitSiweNextAuthProvider>
            <RainbowKitProvider
              theme={darkTheme({
                accentColor: '#4E76A9',
                accentColorForeground: '#fff',
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
