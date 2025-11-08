'use client';

import '@rainbow-me/rainbowkit/styles.css';
import '@getpara/react-sdk/styles.css';
import {
  darkTheme,
  RainbowKitProvider,
  connectorsForWallets,
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
import { getParaWallet } from '@getpara/rainbowkit-wallet';
import { createConfig, http } from 'wagmi';
import { Environment } from '@getpara/web-sdk';

// Get Para configuration from environment
const PARA_API_KEY = process.env.NEXT_PUBLIC_PARA_API_KEY || '';
const PARA_ENVIRONMENT = process.env.NEXT_PUBLIC_PARA_ENVIRONMENT || 'BETA';

export function ProviderWrapper({ children }: { children: React.ReactNode }) {
  const config = useMemo(() => {
    // Initialize Para wallet for RainbowKit
    const paraWallet = getParaWallet({
      para: {
        environment:
          PARA_ENVIRONMENT === 'BETA' ? Environment.BETA : Environment.PRODUCTION,
        apiKey: PARA_API_KEY,
      },
      appName: 'Arbitrum VibeKit',
    });

    // Configure connectors with Para wallet
    const connectors = connectorsForWallets(
      [
        {
          groupName: 'Social Login',
          wallets: [paraWallet],
        },
      ],
      {
        appName: 'Arbitrum VibeKit',
        projectId: '4b49e5e63b9f6253943b470873b47208',
      },
    );

    return createConfig({
      connectors,
      chains: [arbitrum, mainnet],
      transports: {
        [arbitrum.id]: http(),
        [mainnet.id]: http()
      },
      ssr: true,
      storage: createStorage({ storage: cookieStorage }),
    });
  }, []);

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
